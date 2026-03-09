from __future__ import annotations

from typing import TYPE_CHECKING, Any, ClassVar

from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class IdleTool(Tool):
    name = "idle"
    description = (
        "Enter idle state. The agent suspends execution until a new message arrives. "
        "Use this when the current step or task is finished, paused, or blocked, and there is no "
        "immediate next action to take right now. Incoming messages will automatically re-activate you."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {},
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        return agent.request_idle()
