from __future__ import annotations

import json
from math import isfinite
from typing import TYPE_CHECKING, Any, ClassVar

from flowent.tools import Tool

if TYPE_CHECKING:
    from flowent.agent import Agent


class SleepTool(Tool):
    name = "sleep"
    description = (
        "Enter a timed wait that resumes on whichever happens first: a new input "
        "arrives or the requested duration elapses. Use this when you want to wait "
        "until a deadline without missing messages."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "seconds": {
                "type": "number",
                "description": "How many seconds to wait before resuming execution. Supports fractional seconds.",
                "minimum": 0,
            }
        },
        "required": ["seconds"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        seconds = args.get("seconds")
        if isinstance(seconds, bool) or not isinstance(seconds, int | float):
            return json.dumps({"error": "seconds must be a non-negative number"})

        duration = float(seconds)
        if not isfinite(duration) or duration < 0:
            return json.dumps({"error": "seconds must be a non-negative number"})

        return agent.request_sleep(seconds=duration)
