from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class Message:
    from_id: str
    to_id: str
    content: str
    message_id: str | None = None
    timestamp: float = field(default_factory=time.time)
