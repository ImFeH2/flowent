from __future__ import annotations

import threading
from typing import TYPE_CHECKING

from loguru import logger

from app.models import Graph

if TYPE_CHECKING:
    from app.agent import Agent


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: dict[str, Agent] = {}
        self._graphs: dict[str, Graph] = {}
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

    def find_by_name(self, name: str) -> Agent | None:
        with self._lock:
            matches = [a for a in self._agents.values() if a.config.name == name]
            if len(matches) == 1:
                return matches[0]
            return None

    def get_all(self) -> list[Agent]:
        with self._lock:
            return list(self._agents.values())

    def register_graph(self, graph: Graph) -> None:
        with self._lock:
            self._graphs[graph.id] = graph
            logger.info(
                "Graph registered: {} (owner={})",
                graph.id[:8],
                graph.owner_agent_id[:8],
            )

    def unregister_graph(self, graph_id: str) -> None:
        with self._lock:
            removed = self._graphs.pop(graph_id, None)
            if removed:
                logger.info("Graph unregistered: {}", graph_id[:8])

    def get_graph(self, graph_id: str) -> Graph | None:
        with self._lock:
            return self._graphs.get(graph_id)

    def get_all_graphs(self) -> list[Graph]:
        with self._lock:
            return list(self._graphs.values())

    def get_graph_nodes(self, graph_id: str) -> list[Agent]:
        with self._lock:
            return [
                agent
                for agent in self._agents.values()
                if agent.config.graph_id == graph_id
            ]

    def is_graph_owner(self, agent_id: str, graph_id: str | None) -> bool:
        if graph_id is None:
            return False
        with self._lock:
            graph = self._graphs.get(graph_id)
            return graph is not None and graph.owner_agent_id == agent_id

    def can_manage_node(self, agent_id: str, node_id: str) -> bool:
        with self._lock:
            if agent_id == node_id:
                return True
            node = self._agents.get(node_id)
            if node is None or node.config.graph_id is None:
                return False
            graph = self._graphs.get(node.config.graph_id)
            return graph is not None and graph.owner_agent_id == agent_id

    def reset(self) -> None:
        with self._lock:
            self._agents.clear()
            self._graphs.clear()
            logger.debug("Registry reset")


registry = AgentRegistry()
