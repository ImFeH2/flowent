from __future__ import annotations

from typing import TYPE_CHECKING, Any, ClassVar

from flowent_api.tools import Tool

if TYPE_CHECKING:
    from flowent_api.agent import Agent


class SendTool(Tool):
    name = "send"
    description = "Send a formal message to one current contact."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "target": {
                "type": "string",
                "description": "One target id, name, or unique short id from contacts.",
            },
            "parts": {
                "type": "array",
                "description": "Ordered message parts to send.",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string", "enum": ["text", "image"]},
                        "text": {"type": "string"},
                        "asset_id": {"type": "string"},
                        "mime_type": {"type": "string"},
                        "width": {"type": "integer"},
                        "height": {"type": "integer"},
                        "alt": {"type": "string"},
                    },
                    "required": ["type"],
                },
            },
        },
        "required": ["target", "parts"],
        "additionalProperties": False,
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        target = args.get("target")
        if not isinstance(target, str) or not target.strip():
            raise ValueError("send.target must be a non-empty string")
        return agent.send_message(
            target_ref=target.strip(),
            raw_parts=args.get("parts"),
        )
