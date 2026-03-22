from __future__ import annotations

import threading
from typing import TYPE_CHECKING

from loguru import logger

from app.models import Formation, NodeType

if TYPE_CHECKING:
    from app.agent import Agent


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: dict[str, Agent] = {}
        self._formations: dict[str, Formation] = {}
        self._lock = threading.Lock()

    def register(self, agent: Agent) -> None:
        with self._lock:
            self._agents[agent.uuid] = agent
            logger.info(
                "Node registered: {} (type={})",
                agent.uuid[:8],
                agent.config.node_type.value,
            )

    def unregister(self, agent_id: str) -> None:
        with self._lock:
            removed = self._agents.pop(agent_id, None)
            if removed:
                logger.info("Node unregistered: {}", agent_id[:8])

    def get(self, agent_id: str) -> Agent | None:
        with self._lock:
            return self._agents.get(agent_id)

    def get_assistant(self) -> Agent | None:
        with self._lock:
            for agent in self._agents.values():
                if agent.node_type == NodeType.ASSISTANT:
                    return agent
            return None

    def find_by_name(self, name: str) -> Agent | None:
        with self._lock:
            matches = [a for a in self._agents.values() if a.config.name == name]
            if len(matches) == 1:
                return matches[0]
            return None

    def find_by_uuid_prefix(self, prefix: str) -> Agent | None:
        with self._lock:
            matches = [
                agent
                for agent_id, agent in self._agents.items()
                if agent_id.startswith(prefix)
            ]
            if len(matches) == 1:
                return matches[0]
            return None

    def get_all(self) -> list[Agent]:
        with self._lock:
            return list(self._agents.values())

    def register_formation(self, formation: Formation) -> None:
        with self._lock:
            self._formations[formation.id] = formation
            logger.info(
                "Formation registered: {} (owner={})",
                formation.id[:8],
                formation.owner_agent_id[:8],
            )

    def unregister_formation(self, formation_id: str) -> None:
        with self._lock:
            removed = self._formations.pop(formation_id, None)
            if removed:
                logger.info("Formation unregistered: {}", formation_id[:8])

    def get_formation(self, formation_id: str) -> Formation | None:
        with self._lock:
            return self._formations.get(formation_id)

    def get_all_formations(self) -> list[Formation]:
        with self._lock:
            return list(self._formations.values())

    def get_formation_nodes(self, formation_id: str) -> list[Agent]:
        with self._lock:
            return [
                agent
                for agent in self._agents.values()
                if agent.config.formation_id == formation_id
            ]

    def is_formation_owner(self, agent_id: str, formation_id: str | None) -> bool:
        if formation_id is None:
            return False
        with self._lock:
            formation = self._formations.get(formation_id)
            return formation is not None and formation.owner_agent_id == agent_id

    def can_manage_node(self, agent_id: str, node_id: str) -> bool:
        with self._lock:
            if agent_id == node_id:
                return True
            node = self._agents.get(node_id)
            if node is None or node.config.formation_id is None:
                return False
            formation = self._formations.get(node.config.formation_id)
            return formation is not None and formation.owner_agent_id == agent_id

    def reset(self) -> None:
        with self._lock:
            self._agents.clear()
            self._formations.clear()
            logger.debug("Registry reset")


registry = AgentRegistry()
