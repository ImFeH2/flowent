from __future__ import annotations

from dataclasses import dataclass

from app.models.base import Serializable


@dataclass
class TodoItem(Serializable):
    text: str
