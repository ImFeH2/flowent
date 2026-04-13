from __future__ import annotations

import time
from dataclasses import dataclass, field

from app.models.blueprint import BlueprintEdge, BlueprintSlot


@dataclass
class Tab:
    id: str
    title: str
    goal: str = ""
    leader_id: str | None = None
    route_blueprint_id: str | None = None
    route_blueprint_name: str | None = None
    route_blueprint_version: int | None = None
    route_blueprint_slots: list[BlueprintSlot] = field(default_factory=list)
    route_blueprint_edges: list[BlueprintEdge] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def serialize(self) -> dict[str, object]:
        return {
            "id": self.id,
            "title": self.title,
            "goal": self.goal,
            "leader_id": self.leader_id,
            "route_blueprint_source": (
                {
                    "blueprint_id": self.route_blueprint_id,
                    "blueprint_name": self.route_blueprint_name,
                    "blueprint_version": self.route_blueprint_version,
                    "slots": [slot.serialize() for slot in self.route_blueprint_slots],
                    "edges": [edge.serialize() for edge in self.route_blueprint_edges],
                }
                if self.route_blueprint_id is not None
                else None
            ),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_mapping(cls, data: dict[str, object]) -> Tab:
        created_at = data.get("created_at")
        updated_at = data.get("updated_at")
        raw_route_blueprint_source = data.get("route_blueprint_source")
        route_blueprint_source = (
            raw_route_blueprint_source
            if isinstance(raw_route_blueprint_source, dict)
            else {}
        )
        raw_slots = route_blueprint_source.get("slots")
        raw_edges = route_blueprint_source.get("edges")
        return cls(
            id=str(data.get("id", "")),
            title=str(data.get("title", "")),
            goal=str(data.get("goal", "")),
            leader_id=str(data["leader_id"])
            if isinstance(data.get("leader_id"), str)
            else None,
            route_blueprint_id=(
                str(route_blueprint_source["blueprint_id"])
                if isinstance(route_blueprint_source.get("blueprint_id"), str)
                and str(route_blueprint_source["blueprint_id"]).strip()
                else None
            ),
            route_blueprint_name=(
                str(route_blueprint_source["blueprint_name"])
                if isinstance(route_blueprint_source.get("blueprint_name"), str)
                and str(route_blueprint_source["blueprint_name"]).strip()
                else None
            ),
            route_blueprint_version=(
                route_blueprint_source["blueprint_version"]
                if isinstance(route_blueprint_source.get("blueprint_version"), int)
                and route_blueprint_source["blueprint_version"] > 0
                else None
            ),
            route_blueprint_slots=[
                slot
                for slot in (
                    BlueprintSlot.from_mapping(item)
                    for item in (raw_slots if isinstance(raw_slots, list) else [])
                    if isinstance(item, dict)
                )
                if slot is not None
            ],
            route_blueprint_edges=[
                edge
                for edge in (
                    BlueprintEdge.from_mapping(item)
                    for item in (raw_edges if isinstance(raw_edges, list) else [])
                    if isinstance(item, dict)
                )
                if edge is not None
            ],
            created_at=created_at
            if isinstance(created_at, (int, float))
            else time.time(),
            updated_at=updated_at
            if isinstance(updated_at, (int, float))
            else time.time(),
        )
