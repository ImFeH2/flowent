from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Graph:
    id: str
    owner_agent_id: str
    parent_graph_id: str | None = None
    name: str | None = None
    goal: str = ""
    entry_node_id: str | None = None

    def serialize(self) -> dict[str, object]:
        return {
            "id": self.id,
            "owner_agent_id": self.owner_agent_id,
            "parent_graph_id": self.parent_graph_id,
            "name": self.name,
            "goal": self.goal,
            "entry_node_id": self.entry_node_id,
        }
