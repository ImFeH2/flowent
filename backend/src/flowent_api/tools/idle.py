from __future__ import annotations

from typing import TYPE_CHECKING, Any, ClassVar

from flowent_api.tools import Tool

if TYPE_CHECKING:
    from flowent_api.agent import Agent


class IdleTool(Tool):
    name = "idle"
    description = (
        "Enter idle state. The agent suspends execution until a wake signal re-activates it. "
        "Use this when the current step or task is finished, paused, or blocked, and there is no "
        "immediate next action to take right now. Incoming messages will automatically re-activate you as new input messages, and the tool returns the idle duration when execution resumes."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {},
    }

    def execute(self, agent: Agent, args: dict[str, Any], **kwargs: Any) -> str:
        tool_call_id = kwargs.get("tool_call_id")
        if tool_call_id is not None and not isinstance(tool_call_id, str):
            tool_call_id = None
        return agent.request_idle(tool_call_id=tool_call_id)
