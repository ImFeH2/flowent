from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass, field

from app.models import (
    AgentBlueprint,
    BlueprintVersionSummary,
    GraphEdge,
    GraphNodeRecord,
    Tab,
)
from app.state_db import get_legacy_workspace_file_path, open_state_db


@dataclass
class WorkspaceSnapshot:
    tabs: dict[str, Tab] = field(default_factory=dict)
    nodes: dict[str, GraphNodeRecord] = field(default_factory=dict)
    edges: dict[str, GraphEdge] = field(default_factory=dict)
    blueprints: dict[str, AgentBlueprint] = field(default_factory=dict)

    def serialize(self) -> dict[str, object]:
        return {
            "tabs": [tab.serialize() for tab in self.tabs.values()],
            "nodes": [node.serialize() for node in self.nodes.values()],
            "edges": [edge.serialize() for edge in self.edges.values()],
            "blueprints": [
                blueprint.serialize() for blueprint in self.blueprints.values()
            ],
        }

    @classmethod
    def from_mapping(cls, data: dict[str, object]) -> WorkspaceSnapshot:
        raw_tabs = data.get("tabs")
        raw_nodes = data.get("nodes")
        raw_edges = data.get("edges")
        raw_blueprints = data.get("blueprints")
        tabs = {
            tab.id: tab
            for tab in (
                Tab.from_mapping(item)
                for item in (raw_tabs if isinstance(raw_tabs, list) else [])
                if isinstance(item, dict)
            )
        }
        nodes = {
            node.id: node
            for node in (
                GraphNodeRecord.from_mapping(item)
                for item in (raw_nodes if isinstance(raw_nodes, list) else [])
                if isinstance(item, dict)
            )
        }
        edges = {
            edge.id: edge
            for edge in (
                GraphEdge.from_mapping(item)
                for item in (raw_edges if isinstance(raw_edges, list) else [])
                if isinstance(item, dict)
            )
        }
        blueprints = {
            blueprint.id: blueprint
            for blueprint in (
                AgentBlueprint.from_mapping(item)
                for item in (raw_blueprints if isinstance(raw_blueprints, list) else [])
                if isinstance(item, dict)
            )
            if blueprint.id
        }
        return cls(tabs=tabs, nodes=nodes, edges=edges, blueprints=blueprints)


class WorkspaceStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._snapshot: WorkspaceSnapshot | None = None

    def _load_snapshot(self) -> WorkspaceSnapshot:
        if self._snapshot is not None:
            return self._snapshot
        snapshot = self._load_snapshot_from_state_db()
        legacy_snapshot = self._load_snapshot_from_legacy_file()
        if self._snapshot_has_content(
            legacy_snapshot
        ) and not self._snapshot_has_content(snapshot):
            assert legacy_snapshot is not None
            snapshot = legacy_snapshot
            self._persist_snapshot(snapshot)
        if snapshot is None:
            snapshot = (
                legacy_snapshot if legacy_snapshot is not None else WorkspaceSnapshot()
            )
        self._snapshot = snapshot
        return snapshot

    def _load_snapshot_from_state_db(self) -> WorkspaceSnapshot | None:
        connection = open_state_db(create=False)
        if connection is None:
            return None
        try:
            raw: dict[str, object] = {
                "tabs": self._read_payload_rows(connection, "tabs"),
                "nodes": self._read_payload_rows(connection, "nodes"),
                "edges": self._read_payload_rows(connection, "edges"),
                "blueprints": self._read_payload_rows(connection, "blueprints"),
            }
        finally:
            connection.close()
        snapshot = WorkspaceSnapshot.from_mapping(raw)
        if snapshot.serialize() != raw:
            self._persist_snapshot(snapshot)
        return snapshot

    def _load_snapshot_from_legacy_file(self) -> WorkspaceSnapshot | None:
        workspace_file = get_legacy_workspace_file_path()
        if not workspace_file.exists():
            return None
        raw = json.loads(workspace_file.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return WorkspaceSnapshot()
        return WorkspaceSnapshot.from_mapping(raw)

    def _snapshot_has_content(self, snapshot: WorkspaceSnapshot | None) -> bool:
        return bool(
            snapshot is not None
            and (
                snapshot.tabs or snapshot.nodes or snapshot.edges or snapshot.blueprints
            )
        )

    def _read_payload_rows(
        self,
        connection,
        table_name: str,
    ) -> list[dict[str, object]]:
        try:
            rows = connection.execute(
                f"SELECT payload FROM {table_name} ORDER BY rowid"
            ).fetchall()
        except Exception as exc:
            raise RuntimeError(
                f"Failed to read workspace table `{table_name}` from state store: {exc}"
            ) from exc
        payloads: list[dict[str, object]] = []
        for row in rows:
            payload = row["payload"]
            if not isinstance(payload, str):
                continue
            parsed = json.loads(payload)
            if isinstance(parsed, dict):
                payloads.append(parsed)
        return payloads

    def _persist_snapshot(self, snapshot: WorkspaceSnapshot) -> None:
        connection = open_state_db(create=True)
        assert connection is not None
        try:
            with connection:
                connection.execute("DELETE FROM tabs")
                connection.execute("DELETE FROM nodes")
                connection.execute("DELETE FROM edges")
                connection.execute("DELETE FROM blueprints")
                connection.executemany(
                    "INSERT INTO tabs (id, payload, updated_at) VALUES (?, ?, ?)",
                    [
                        (
                            tab.id,
                            json.dumps(tab.serialize(), ensure_ascii=False),
                            tab.updated_at,
                        )
                        for tab in snapshot.tabs.values()
                    ],
                )
                connection.executemany(
                    """
                    INSERT INTO nodes (id, payload, tab_id, node_type, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            record.id,
                            json.dumps(record.serialize(), ensure_ascii=False),
                            record.config.tab_id,
                            record.config.node_type.value,
                            record.updated_at,
                        )
                        for record in snapshot.nodes.values()
                    ],
                )
                connection.executemany(
                    "INSERT INTO edges (id, payload, tab_id) VALUES (?, ?, ?)",
                    [
                        (
                            edge.id,
                            json.dumps(edge.serialize(), ensure_ascii=False),
                            edge.tab_id,
                        )
                        for edge in snapshot.edges.values()
                    ],
                )
                connection.executemany(
                    "INSERT INTO blueprints (id, payload, updated_at) VALUES (?, ?, ?)",
                    [
                        (
                            blueprint.id,
                            json.dumps(blueprint.serialize(), ensure_ascii=False),
                            blueprint.updated_at,
                        )
                        for blueprint in snapshot.blueprints.values()
                    ],
                )
        finally:
            connection.close()

    def reset_cache(self) -> None:
        with self._lock:
            self._snapshot = None

    def list_tabs(self) -> list[Tab]:
        with self._lock:
            return list(self._load_snapshot().tabs.values())

    def get_tab(self, tab_id: str) -> Tab | None:
        with self._lock:
            return self._load_snapshot().tabs.get(tab_id)

    def upsert_tab(self, tab: Tab) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            tab.updated_at = time.time()
            snapshot.tabs[tab.id] = tab
            self._persist_snapshot(snapshot)

    def delete_tab(self, tab_id: str) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            snapshot.tabs.pop(tab_id, None)
            node_ids = [
                node_id
                for node_id, node in snapshot.nodes.items()
                if node.config.tab_id == tab_id
            ]
            for node_id in node_ids:
                snapshot.nodes.pop(node_id, None)
            edge_ids = [
                edge_id
                for edge_id, edge in snapshot.edges.items()
                if edge.tab_id == tab_id
                or edge.from_node_id in node_ids
                or edge.to_node_id in node_ids
            ]
            for edge_id in edge_ids:
                snapshot.edges.pop(edge_id, None)
            self._persist_snapshot(snapshot)

    def list_node_records(self, tab_id: str | None = None) -> list[GraphNodeRecord]:
        with self._lock:
            nodes = list(self._load_snapshot().nodes.values())
            if tab_id is None:
                return nodes
            return [node for node in nodes if node.config.tab_id == tab_id]

    def get_node_record(self, node_id: str) -> GraphNodeRecord | None:
        with self._lock:
            return self._load_snapshot().nodes.get(node_id)

    def upsert_node_record(self, record: GraphNodeRecord) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            record.updated_at = time.time()
            snapshot.nodes[record.id] = record
            if record.config.tab_id and record.config.tab_id in snapshot.tabs:
                snapshot.tabs[record.config.tab_id].updated_at = record.updated_at
            self._persist_snapshot(snapshot)

    def delete_node_record(self, node_id: str) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            record = snapshot.nodes.pop(node_id, None)
            if record is None:
                return
            edge_ids = [
                edge_id
                for edge_id, edge in snapshot.edges.items()
                if edge.from_node_id == node_id or edge.to_node_id == node_id
            ]
            for edge_id in edge_ids:
                snapshot.edges.pop(edge_id, None)
            if record.config.tab_id and record.config.tab_id in snapshot.tabs:
                snapshot.tabs[record.config.tab_id].updated_at = time.time()
            self._persist_snapshot(snapshot)

    def list_edges(self, tab_id: str | None = None) -> list[GraphEdge]:
        with self._lock:
            edges = list(self._load_snapshot().edges.values())
            if tab_id is None:
                return edges
            return [edge for edge in edges if edge.tab_id == tab_id]

    def get_edge(self, edge_id: str) -> GraphEdge | None:
        with self._lock:
            return self._load_snapshot().edges.get(edge_id)

    def upsert_edge(self, edge: GraphEdge) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            snapshot.edges[edge.id] = edge
            if edge.tab_id in snapshot.tabs:
                snapshot.tabs[edge.tab_id].updated_at = time.time()
            self._persist_snapshot(snapshot)

    def delete_edge(self, edge_id: str) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            edge = snapshot.edges.pop(edge_id, None)
            if edge is None:
                return
            if edge.tab_id in snapshot.tabs:
                snapshot.tabs[edge.tab_id].updated_at = time.time()
            self._persist_snapshot(snapshot)

    def list_blueprints(self) -> list[AgentBlueprint]:
        with self._lock:
            return list(self._load_snapshot().blueprints.values())

    def get_blueprint(self, blueprint_id: str) -> AgentBlueprint | None:
        with self._lock:
            return self._load_snapshot().blueprints.get(blueprint_id)

    def upsert_blueprint(self, blueprint: AgentBlueprint) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            updated_at = time.time()
            blueprint.updated_at = updated_at
            if not blueprint.version_history:
                blueprint.version_history.append(
                    BlueprintVersionSummary(
                        version=blueprint.version,
                        updated_at=updated_at,
                    )
                )
            elif blueprint.version_history[-1].version == blueprint.version:
                blueprint.version_history[-1].updated_at = updated_at
            else:
                blueprint.version_history.append(
                    BlueprintVersionSummary(
                        version=blueprint.version,
                        updated_at=updated_at,
                    )
                )
            snapshot.blueprints[blueprint.id] = blueprint
            self._persist_snapshot(snapshot)

    def delete_blueprint(self, blueprint_id: str) -> None:
        with self._lock:
            snapshot = self._load_snapshot()
            if snapshot.blueprints.pop(blueprint_id, None) is None:
                return
            self._persist_snapshot(snapshot)


workspace_store = WorkspaceStore()
