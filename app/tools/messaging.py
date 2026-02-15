from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.events import event_bus
from app.models import Event, EventType, Message
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class SendMessageTool(Tool):
    name = "send_message"
    description = "Send a message to another agent by their UUID."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "to_id": {"type": "string", "description": "Target agent UUID"},
            "content": {"type": "string", "description": "Message content"},
        },
        "required": ["to_id", "content"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.registry import registry

        target_id = args["to_id"]
        content = args["content"]

        if target_id == "human":
            logger.debug(
                "Message sent: {} -> human ({} chars)",
                agent.uuid[:8],
                len(content),
            )
            event_bus.emit(
                Event(
                    type=EventType.AGENT_MESSAGE,
                    agent_id=agent.uuid,
                    data={"to_id": "human", "content": content},
                ),
            )
            return json.dumps({"status": "sent"})

        target = registry.get(target_id)
        if target is None:
            return json.dumps({"error": f"Agent {target_id} not found"})

        msg = Message(from_id=agent.uuid, to_id=target_id, content=content)
        target.enqueue_message(msg)

        logger.debug(
            "Message sent: {} -> {} ({} chars)",
            agent.uuid[:8],
            target_id[:8],
            len(content),
        )

        event_bus.emit(
            Event(
                type=EventType.AGENT_MESSAGE,
                agent_id=agent.uuid,
                data={"to_id": target_id, "content": content},
            ),
        )
        return json.dumps({"status": "sent"})


class IdleTool(Tool):
    name = "idle"
    description = "Enter idle state and wait for incoming messages. The agent sleeps until a message arrives or it is terminated."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {},
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.models import AgentState

        agent.set_state(AgentState.IDLE)
        messages: list[dict[str, str]] = []

        while not agent._terminate.is_set():
            msg = agent.try_get_message(timeout=2.0)
            if msg:
                messages.append(
                    {
                        "from_id": msg.from_id,
                        "content": msg.content,
                    },
                )
                break

        while True:
            msg = agent.try_get_message(timeout=0)
            if msg is None:
                break
            messages.append(
                {
                    "from_id": msg.from_id,
                    "content": msg.content,
                },
            )

        agent.set_state(AgentState.RUNNING)
        if not messages:
            return json.dumps({"messages": [], "note": "Terminated while idle"})
        return json.dumps({"messages": messages})
