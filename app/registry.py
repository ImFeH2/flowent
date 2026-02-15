from __future__ import annotations

import threading
from typing import TYPE_CHECKING

from loguru import logger

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
                "Agent registered: {} (role={})",
                agent.uuid[:8],
                agent.config.role.value,
            )

    def unregister(self, agent_id: str) -> None:
        with self._lock:
            removed = self._agents.pop(agent_id, None)
            if removed:
                logger.info("Agent unregistered: {}", agent_id[:8])

    def get(self, agent_id: str) -> Agent | None:
        with self._lock:
            return self._agents.get(agent_id)

    def get_children(self, supervisor_id: str) -> list[Agent]:
        with self._lock:
            return [
                a
                for a in self._agents.values()
                if a.config.supervisor_id == supervisor_id
            ]

    def get_all(self) -> list[Agent]:
        with self._lock:
            return list(self._agents.values())

    def reset(self) -> None:
        with self._lock:
            self._agents.clear()
            logger.debug("Registry reset")


registry = AgentRegistry()
