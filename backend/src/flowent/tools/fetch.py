from __future__ import annotations

import json
from collections.abc import Callable
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from flowent.network import create_http_session, iter_response_text
from flowent.tools import Tool, re_raise_interrupt

if TYPE_CHECKING:
    from flowent.agent import Agent


class FetchTool(Tool):
    name = "fetch"
    description = "Make an HTTP request."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "method": {
                "type": "string",
                "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"],
                "description": "HTTP method",
            },
            "url": {"type": "string", "description": "Request URL"},
            "headers": {
                "type": "object",
                "description": "Request headers (optional)",
            },
            "body": {"type": "string", "description": "Request body (optional)"},
        },
        "required": ["method", "url"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **kwargs: Any) -> str:
        method = args["method"]
        url = args["url"]
        on_output: Callable[[str], None] | None = kwargs.get("on_output")
        logger.debug("HTTP {} {}", method, url)
        try:
            with (
                create_http_session(timeout=30.0, impersonate_browser=True) as client,
                client.stream(
                    method,
                    url,
                    headers=args.get("headers"),
                    data=args.get("body"),
                ) as response,
            ):
                close_response = getattr(response, "close", None)
                agent.set_interrupt_callback(
                    close_response if callable(close_response) else None
                )
                if on_output is not None:
                    on_output(f"{method} {url}\n")
                    on_output(f"HTTP {response.status_code}\n\n")

                remaining = 5000
                body_parts: list[str] = []
                for chunk in iter_response_text(response):
                    if not chunk or remaining <= 0:
                        continue
                    if len(chunk) > remaining:
                        chunk = chunk[:remaining]
                    body_parts.append(chunk)
                    remaining -= len(chunk)
                    if on_output is not None:
                        on_output(chunk)

            body = "".join(body_parts)
            logger.debug("HTTP {} {} -> {}", method, url, response.status_code)
            return json.dumps(
                {
                    "status_code": response.status_code,
                    "body": body,
                }
            )
        except Exception as e:
            re_raise_interrupt(agent, e)
            logger.warning("HTTP request failed: {} {} - {}", method, url, e)
            return json.dumps({"error": str(e)})
        finally:
            agent.set_interrupt_callback(None)
