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
    network_blueprint_id: str | None = None
    network_blueprint_name: str | None = None
    network_blueprint_version: int | None = None
    network_blueprint_slots: list[BlueprintSlot] = field(default_factory=list)
    network_blueprint_edges: list[BlueprintEdge] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def serialize(self) -> dict[str, object]:
        return {
            "id": self.id,
            "title": self.title,
            "goal": self.goal,
            "leader_id": self.leader_id,
            "network_blueprint_source": (
                {
                    "blueprint_id": self.network_blueprint_id,
                    "blueprint_name": self.network_blueprint_name,
                    "blueprint_version": self.network_blueprint_version,
                    "slots": [
                        slot.serialize() for slot in self.network_blueprint_slots
                    ],
                    "edges": [
                        edge.serialize() for edge in self.network_blueprint_edges
                    ],
                }
                if self.network_blueprint_id is not None
                else None
            ),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_mapping(cls, data: dict[str, object]) -> Tab:
        created_at = data.get("created_at")
        updated_at = data.get("updated_at")
        raw_network_blueprint_source = data.get("network_blueprint_source")
        if not isinstance(raw_network_blueprint_source, dict):
            raw_network_blueprint_source = data.get("route_blueprint_source")
        network_blueprint_source = (
            raw_network_blueprint_source
            if isinstance(raw_network_blueprint_source, dict)
            else {}
        )
        raw_slots = network_blueprint_source.get("slots")
        raw_edges = network_blueprint_source.get("edges")
        return cls(
            id=str(data.get("id", "")),
            title=str(data.get("title", "")),
            goal=str(data.get("goal", "")),
            leader_id=str(data["leader_id"])
            if isinstance(data.get("leader_id"), str)
            else None,
            network_blueprint_id=(
                str(network_blueprint_source["blueprint_id"])
                if isinstance(network_blueprint_source.get("blueprint_id"), str)
                and str(network_blueprint_source["blueprint_id"]).strip()
                else None
            ),
            network_blueprint_name=(
                str(network_blueprint_source["blueprint_name"])
                if isinstance(network_blueprint_source.get("blueprint_name"), str)
                and str(network_blueprint_source["blueprint_name"]).strip()
                else None
            ),
            network_blueprint_version=(
                network_blueprint_source["blueprint_version"]
                if isinstance(network_blueprint_source.get("blueprint_version"), int)
                and network_blueprint_source["blueprint_version"] > 0
                else None
            ),
            network_blueprint_slots=[
                slot
                for slot in (
                    BlueprintSlot.from_mapping(item)
                    for item in (raw_slots if isinstance(raw_slots, list) else [])
                    if isinstance(item, dict)
                )
                if slot is not None
            ],
            network_blueprint_edges=[
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
