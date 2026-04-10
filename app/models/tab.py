from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class Tab:
    id: str
    title: str
    goal: str = ""
    leader_id: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def serialize(self) -> dict[str, object]:
        return {
            "id": self.id,
            "title": self.title,
            "goal": self.goal,
            "leader_id": self.leader_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_mapping(cls, data: dict[str, object]) -> Tab:
        created_at = data.get("created_at")
        updated_at = data.get("updated_at")
        return cls(
            id=str(data.get("id", "")),
            title=str(data.get("title", "")),
            goal=str(data.get("goal", "")),
            leader_id=str(data["leader_id"])
            if isinstance(data.get("leader_id"), str)
            else None,
            created_at=created_at
            if isinstance(created_at, (int, float))
            else time.time(),
            updated_at=updated_at
            if isinstance(updated_at, (int, float))
            else time.time(),
        )
