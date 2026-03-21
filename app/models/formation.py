from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Formation:
    id: str
    owner_agent_id: str
    parent_formation_id: str | None = None
    name: str | None = None
    goal: str = ""

    def serialize(self) -> dict[str, object]:
        return {
            "id": self.id,
            "owner_agent_id": self.owner_agent_id,
            "parent_formation_id": self.parent_formation_id,
            "name": self.name,
            "goal": self.goal,
        }
