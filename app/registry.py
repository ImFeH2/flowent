from __future__ import annotations

import threading
from typing import TYPE_CHECKING

from loguru import logger

from app.models import NodeType

if TYPE_CHECKING:
    from app.agent import Agent


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: dict[str, Agent] = {}
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

    def reset(self) -> None:
        with self._lock:
            self._agents.clear()
            logger.debug("Registry reset")


registry = AgentRegistry()
