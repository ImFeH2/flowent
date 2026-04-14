from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class BlueprintSlot:
    id: str
    role_name: str
    display_name: str | None = None

    def serialize(self) -> dict[str, object]:
        return {
            "id": self.id,
            "role_name": self.role_name,
            "display_name": self.display_name,
        }

    @classmethod
    def from_mapping(cls, data: dict[str, object]) -> BlueprintSlot | None:
        slot_id = data.get("id")
        role_name = data.get("role_name")
        if not isinstance(slot_id, str) or not slot_id.strip():
            return None
        if not isinstance(role_name, str) or not role_name.strip():
            return None
        raw_display_name = data.get("display_name")
        return cls(
            id=slot_id.strip(),
            role_name=role_name.strip(),
            display_name=(
                raw_display_name.strip()
                if isinstance(raw_display_name, str) and raw_display_name.strip()
                else None
            ),
        )


@dataclass
class BlueprintEdge:
    from_slot_id: str
    to_slot_id: str

    def serialize(self) -> dict[str, object]:
        return {
            "from_slot_id": self.from_slot_id,
            "to_slot_id": self.to_slot_id,
        }

    @classmethod
    def from_mapping(cls, data: dict[str, object]) -> BlueprintEdge | None:
        from_slot_id = data.get("from_slot_id")
        to_slot_id = data.get("to_slot_id")
        if not isinstance(from_slot_id, str) or not from_slot_id.strip():
            return None
        if not isinstance(to_slot_id, str) or not to_slot_id.strip():
            return None
        return cls(
            from_slot_id=from_slot_id.strip(),
            to_slot_id=to_slot_id.strip(),
        )


@dataclass
class BlueprintVersionSummary:
    version: int
    updated_at: float

    def serialize(self) -> dict[str, object]:
        return {
            "version": self.version,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_mapping(
        cls,
        data: dict[str, object],
    ) -> BlueprintVersionSummary | None:
        version = data.get("version")
        updated_at = data.get("updated_at")
        if not isinstance(version, int) or version <= 0:
            return None
        if not isinstance(updated_at, (int, float)):
            return None
        return cls(version=version, updated_at=updated_at)


@dataclass
class RouteBlueprint:
    id: str
    name: str
    description: str = ""
    version: int = 1
    slots: list[BlueprintSlot] = field(default_factory=list)
    edges: list[BlueprintEdge] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    version_history: list[BlueprintVersionSummary] = field(default_factory=list)

    def serialize(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "slots": [slot.serialize() for slot in self.slots],
            "edges": [edge.serialize() for edge in self.edges],
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "version_history": [item.serialize() for item in self.version_history],
        }

    @classmethod
    def from_mapping(cls, data: dict[str, object]) -> RouteBlueprint:
        created_at = data.get("created_at")
        updated_at = data.get("updated_at")
        raw_slots = data.get("slots")
        raw_edges = data.get("edges")
        raw_version_history = data.get("version_history")
        slots = [
            slot
            for slot in (
                BlueprintSlot.from_mapping(item)
                for item in (raw_slots if isinstance(raw_slots, list) else [])
                if isinstance(item, dict)
            )
            if slot is not None
        ]
        edges = [
            edge
            for edge in (
                BlueprintEdge.from_mapping(item)
                for item in (raw_edges if isinstance(raw_edges, list) else [])
                if isinstance(item, dict)
            )
            if edge is not None
        ]
        raw_version = data.get("version")
        normalized_created_at = (
            created_at if isinstance(created_at, (int, float)) else time.time()
        )
        normalized_updated_at = (
            updated_at if isinstance(updated_at, (int, float)) else time.time()
        )
        version = raw_version if isinstance(raw_version, int) and raw_version > 0 else 1
        version_history = [
            item
            for item in (
                BlueprintVersionSummary.from_mapping(entry)
                for entry in (
                    raw_version_history if isinstance(raw_version_history, list) else []
                )
                if isinstance(entry, dict)
            )
            if item is not None
        ]
        if not version_history:
            version_history = [
                BlueprintVersionSummary(
                    version=version,
                    updated_at=normalized_updated_at,
                )
            ]
        return cls(
            id=str(data.get("id", "")),
            name=str(data.get("name", "")),
            description=str(data.get("description", "")),
            version=version,
            slots=slots,
            edges=edges,
            created_at=normalized_created_at,
            updated_at=normalized_updated_at,
            version_history=version_history,
        )
