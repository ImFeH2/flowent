from __future__ import annotations

import json
import uuid
from contextlib import suppress
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, ClassVar

from app.formation_runtime import (
    connect_nodes,
    disconnect_nodes,
    emit_formation_created,
)
from app.models import Formation
from app.tools import Tool
from app.tools.spawn import PreparedSpawn, prepare_spawn, spawn_prepared_agent

if TYPE_CHECKING:
    from app.agent import Agent


@dataclass
class DeclarativeNodeSpec:
    name: str
    prepared: PreparedSpawn


@dataclass
class DeclarativeEdgeSpec:
    from_name: str
    to_name: str
    bidirectional: bool = False

    def serialize(self) -> dict[str, object]:
        return {
            "from": self.from_name,
            "to": self.to_name,
            "bidirectional": self.bidirectional,
        }


class CreateFormationTool(Tool):
    name = "create_formation"
    description = (
        "Create a child formation owned by the current agent. "
        "You may pass only name/goal to create an empty formation, "
        "or additionally pass nodes and edges to declaratively create the full structure in one call. "
        "Declarative creation does not assign tasks by itself; after creation, explicitly message each node that should start work."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Human-readable formation name",
            },
            "goal": {
                "type": "string",
                "description": "Goal or purpose of this formation",
            },
            "nodes": {
                "type": "array",
                "description": "Optional declarative node list to create inside the formation",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Human-readable node name",
                        },
                        "role": {
                            "type": "string",
                            "description": "Role name for the node",
                        },
                        "tools": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional additional tools for the node",
                        },
                        "write_dirs": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional write directories for the node",
                        },
                        "allow_network": {
                            "type": "boolean",
                            "description": "Whether the node can access the network",
                            "default": False,
                        },
                    },
                    "required": ["name", "role"],
                },
            },
            "edges": {
                "type": "array",
                "description": "Optional extra directed edges to create between declared nodes",
                "items": {
                    "type": "object",
                    "properties": {
                        "from": {
                            "type": "string",
                            "description": "Source node name from the nodes list",
                        },
                        "to": {
                            "type": "string",
                            "description": "Target node name from the nodes list",
                        },
                        "bidirectional": {
                            "type": "boolean",
                            "description": "Whether to also create the reverse edge",
                            "default": False,
                        },
                    },
                    "required": ["from", "to"],
                },
            },
        },
        "required": [],
    }

    @staticmethod
    def _validate_nodes(
        agent: Agent,
        formation: Formation,
        raw_nodes: object,
    ) -> tuple[list[DeclarativeNodeSpec] | None, str | None]:
        if raw_nodes is None:
            return [], None
        if not isinstance(raw_nodes, list):
            return None, "nodes must be an array"

        specs: list[DeclarativeNodeSpec] = []
        seen_names: set[str] = set()

        for index, raw_node in enumerate(raw_nodes):
            if not isinstance(raw_node, dict):
                return None, f"nodes[{index}] must be an object"

            name = raw_node.get("name")
            role = raw_node.get("role")
            if not isinstance(name, str) or not name.strip():
                return None, f"nodes[{index}].name must be a non-empty string"
            if not isinstance(role, str) or not role.strip():
                return None, f"nodes[{index}].role must be a non-empty string"

            normalized_name = name.strip()
            if normalized_name in seen_names:
                return None, f"nodes contains duplicate name '{normalized_name}'"
            seen_names.add(normalized_name)

            prepared, error = prepare_spawn(
                agent,
                {
                    "role_name": role.strip(),
                    "name": normalized_name,
                    "tools": raw_node.get("tools", []),
                    "write_dirs": raw_node.get("write_dirs", []),
                    "allow_network": raw_node.get("allow_network", False),
                    "formation_id": formation.id,
                },
                formation=formation,
            )
            if error is not None:
                return None, error

            assert prepared is not None
            prepared.config.name = normalized_name
            specs.append(DeclarativeNodeSpec(name=normalized_name, prepared=prepared))

        return specs, None

    @staticmethod
    def _validate_edges(
        raw_edges: object,
        valid_names: set[str],
    ) -> tuple[list[DeclarativeEdgeSpec] | None, str | None]:
        if raw_edges is None:
            return [], None
        if not isinstance(raw_edges, list):
            return None, "edges must be an array"

        specs: list[DeclarativeEdgeSpec] = []
        for index, raw_edge in enumerate(raw_edges):
            if not isinstance(raw_edge, dict):
                return None, f"edges[{index}] must be an object"

            from_name = raw_edge.get("from")
            to_name = raw_edge.get("to")
            bidirectional = raw_edge.get("bidirectional", False)

            if not isinstance(from_name, str) or not from_name.strip():
                return None, f"edges[{index}].from must be a non-empty string"
            if not isinstance(to_name, str) or not to_name.strip():
                return None, f"edges[{index}].to must be a non-empty string"
            if not isinstance(bidirectional, bool):
                return None, f"edges[{index}].bidirectional must be a boolean"

            normalized_from = from_name.strip()
            normalized_to = to_name.strip()
            if normalized_from not in valid_names:
                return None, f"edges references unknown node '{normalized_from}'"
            if normalized_to not in valid_names:
                return None, f"edges references unknown node '{normalized_to}'"

            specs.append(
                DeclarativeEdgeSpec(
                    from_name=normalized_from,
                    to_name=normalized_to,
                    bidirectional=bidirectional,
                )
            )

        return specs, None

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.registry import registry

        name = args.get("name")
        goal = args.get("goal")
        if name is not None and not isinstance(name, str):
            return json.dumps({"error": "name must be a string"})
        if goal is not None and not isinstance(goal, str):
            return json.dumps({"error": "goal must be a string"})

        formation = Formation(
            id=str(uuid.uuid4()),
            owner_agent_id=agent.uuid,
            parent_formation_id=agent.config.formation_id,
            name=name.strip() if isinstance(name, str) and name.strip() else None,
            goal=goal.strip() if isinstance(goal, str) else "",
        )

        node_specs, error = self._validate_nodes(agent, formation, args.get("nodes"))
        if error is not None:
            return json.dumps({"error": error})

        assert node_specs is not None

        edge_specs, error = self._validate_edges(
            args.get("edges"),
            {spec.name for spec in node_specs},
        )
        if error is not None:
            return json.dumps({"error": error})

        assert edge_specs is not None

        registry.register_formation(formation)
        emit_formation_created(formation)

        if not node_specs and not edge_specs:
            return json.dumps(formation.serialize())

        created_nodes: list[dict[str, str]] = []
        created_children = []
        created_edges: list[tuple[str, str]] = []
        created_edge_specs: list[dict[str, object]] = []
        nodes_by_name: dict[str, str] = {}

        try:
            for node_spec in node_specs:
                child, payload = spawn_prepared_agent(agent, node_spec.prepared)
                created_children.append(child)
                created_nodes.append(payload)
                nodes_by_name[node_spec.name] = child.uuid

            for edge_spec in edge_specs:
                source_id = nodes_by_name[edge_spec.from_name]
                target_id = nodes_by_name[edge_spec.to_name]
                connect_nodes(source_id, target_id)
                created_edges.append((source_id, target_id))
                if edge_spec.bidirectional:
                    connect_nodes(target_id, source_id)
                    created_edges.append((target_id, source_id))
                created_edge_specs.append(edge_spec.serialize())
        except Exception as exc:
            for from_id, to_id in reversed(created_edges):
                with suppress(Exception):
                    disconnect_nodes(from_id, to_id)

            for child in reversed(created_children):
                with suppress(Exception):
                    child.terminate_and_wait(timeout=30.0)

            registry.unregister_formation(formation.id)
            return json.dumps({"error": str(exc)})

        return json.dumps(
            {
                **formation.serialize(),
                "nodes": created_nodes,
                "edges": created_edge_specs,
            }
        )
