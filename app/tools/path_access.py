from __future__ import annotations

import json
import os
import threading
import uuid
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.events import event_bus
from app.models import Event, EventType
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


_pending_requests: dict[str, dict[str, Any]] = {}
_pending_locks: dict[str, threading.Event] = {}


def resolve_path_access(request_id: str, approved: bool) -> bool:
    req = _pending_requests.get(request_id)
    if req is None:
        return False

    req["approved"] = approved
    lock = _pending_locks.get(request_id)
    if lock:
        lock.set()
    return True


class RequestPathAccessTool(Tool):
    name = "request_path_access"
    description = (
        "Request access to a filesystem path. This will prompt the human user for approval. "
        "If approved, the path is added to your allowed and writable paths."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Absolute path to request access to",
            },
            "reason": {
                "type": "string",
                "description": "Reason for requesting access to this path",
            },
        },
        "required": ["path", "reason"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        path = os.path.normpath(os.path.abspath(args["path"]))
        reason = args["reason"]

        request_id = str(uuid.uuid4())
        lock = threading.Event()

        _pending_requests[request_id] = {
            "path": path,
            "reason": reason,
            "agent_id": agent.uuid,
            "approved": None,
        }
        _pending_locks[request_id] = lock

        event_bus.emit(
            Event(
                type=EventType.PATH_ACCESS_REQUESTED,
                agent_id=agent.uuid,
                data={
                    "request_id": request_id,
                    "path": path,
                    "reason": reason,
                },
            ),
        )

        logger.info(
            "Path access requested: {} (reason: {}, request_id: {})",
            path,
            reason,
            request_id[:8],
        )

        approved = lock.wait(timeout=300)

        req = _pending_requests.pop(request_id, None)
        _pending_locks.pop(request_id, None)

        if not approved or req is None or req["approved"] is None:
            logger.info("Path access request timed out: {}", request_id[:8])
            return json.dumps({"status": "denied", "reason": "Request timed out"})

        if req["approved"]:
            agent.config.permissions.allowed_paths.append(path)
            agent.config.permissions.writable_paths.append(path)
            logger.info("Path access approved: {} for agent {}", path, agent.uuid[:8])
            return json.dumps({"status": "approved", "path": path})
        logger.info("Path access denied: {} for agent {}", path, agent.uuid[:8])
        return json.dumps({"status": "denied", "reason": "User denied access"})
