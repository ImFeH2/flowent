from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Serializable:
    def serialize(self) -> dict[str, Any]:
        fields: dict[str, Any] = {}
        for k, v in self.__dict__.items():
            if k.startswith("_"):
                continue
            if isinstance(v, Serializable):
                fields[k] = v.serialize()
            elif isinstance(v, list):
                fields[k] = [
                    item.serialize() if isinstance(item, Serializable) else item
                    for item in v
                ]
            else:
                fields[k] = v
        fields["type"] = self.__class__.__name__
        return fields
