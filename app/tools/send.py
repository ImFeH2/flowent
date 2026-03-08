from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.events import event_bus
from app.models import Event, EventType, Message
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


def send_message(agent: Agent, target_ref: str, content: str) -> dict[str, Any]:
    from app.registry import registry

    target = registry.get(target_ref)
    if target is None:
        target = registry.find_by_name(target_ref)
    if target is None:
        return {"error": f"Node '{target_ref}' not found"}

    if not agent.is_connected_to(target.uuid):
        return {"error": f"Not connected to node '{target_ref}'"}

    msg = Message(from_id=agent.uuid, to_id=target.uuid, content=content)
    target.enqueue_message(msg)

    logger.debug(
        "Message sent: {} -> {} ({} chars)",
        agent.uuid[:8],
        target.uuid[:8],
        len(content),
    )

    event_bus.emit(
        Event(
            type=EventType.NODE_MESSAGE,
            agent_id=agent.uuid,
            data={"to_id": target.uuid, "content": content},
        ),
    )
    return {"status": "sent"}


class SendTool(Tool):
    name = "send"
    description = "Send a message to a connected node by UUID."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "to": {
                "type": "string",
                "description": "Target node UUID",
            },
            "content": {"type": "string", "description": "Message content"},
        },
        "required": ["to", "content"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        return json.dumps(send_message(agent, args["to"], args["content"]))
