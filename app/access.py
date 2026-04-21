from __future__ import annotations

import hashlib
import secrets
import threading
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import Request
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.websockets import WebSocket

from app.settings import AccessSettings, Settings, get_settings, save_settings

ACCESS_SESSION_KEY = "admin_session_generation"
ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ACCESS_PUBLIC_PATHS = frozenset(
    {
        "/api/access/state",
        "/api/access/login",
        "/api/access/logout",
    }
)


@dataclass
class _AccessRuntimeState:
    bootstrap_generated: bool = False
    live_signature: tuple[bool, int, str] | None = None


_runtime_state = _AccessRuntimeState()
_runtime_lock = threading.Lock()


def _hash_access_code(code: str, salt: str) -> str:
    payload = f"{salt}:{code}".encode()
    return hashlib.sha256(payload).hexdigest()


def generate_access_code() -> str:
    groups = [
        "".join(secrets.choice(ACCESS_CODE_ALPHABET) for _ in range(4))
        for _ in range(3)
    ]
    return "-".join(groups)


def is_access_configured(access: AccessSettings) -> bool:
    return bool(access.code_hash.strip() and access.code_salt.strip())


def set_access_code(settings: Settings, code: str) -> None:
    salt = secrets.token_hex(16)
    current_generation = settings.access.session_generation
    session_signing_secret = settings.access.session_signing_secret
    settings.access = AccessSettings(
        code_hash=_hash_access_code(code, salt),
        code_salt=salt,
        session_generation=1 if current_generation <= 0 else current_generation + 1,
        session_signing_secret=session_signing_secret,
    )
    with _runtime_lock:
        _runtime_state.bootstrap_generated = False


def clear_access_code(settings: Settings) -> bool:
    was_configured = is_access_configured(settings.access)
    next_generation = (
        1
        if settings.access.session_generation <= 0
        else settings.access.session_generation + 1
    )
    settings.access = AccessSettings(
        session_generation=next_generation,
        session_signing_secret=settings.access.session_signing_secret,
    )
    with _runtime_lock:
        _runtime_state.bootstrap_generated = False
    return was_configured


def verify_access_code(access: AccessSettings, code: str) -> bool:
    if not is_access_configured(access):
        return False
    expected = _hash_access_code(code, access.code_salt)
    return secrets.compare_digest(expected, access.code_hash)


def ensure_access_bootstrap(settings: Settings) -> str | None:
    generated_code: str | None = None
    if not is_access_configured(settings.access):
        generated_code = generate_access_code()
        set_access_code(settings, generated_code)
        logger.warning("Generated Autopoe admin access code: {}", generated_code)
    with _runtime_lock:
        _runtime_state.bootstrap_generated = generated_code is not None
    return generated_code


def ensure_session_signing_secret(settings: Settings) -> bool:
    if settings.access.session_signing_secret.strip():
        return False
    settings.access.session_signing_secret = secrets.token_urlsafe(32)
    return True


def _read_live_access_settings() -> AccessSettings:
    from app.settings import _SETTINGS_FILE, _read_settings_file

    settings_file = Path(_SETTINGS_FILE)
    if settings_file.exists():
        try:
            settings, _ = _read_settings_file()
            return settings.access
        except Exception as exc:
            logger.warning(
                "Failed to read live access settings from {}: {}",
                settings_file,
                exc,
            )
    return get_settings().access


def _build_live_signature(access: AccessSettings) -> tuple[bool, int, str]:
    return (
        is_access_configured(access),
        access.session_generation,
        access.session_signing_secret,
    )


def initialize_live_access_signature() -> None:
    access = _read_live_access_settings()
    with _runtime_lock:
        _runtime_state.live_signature = _build_live_signature(access)


def refresh_live_access_signature() -> bool:
    access = _read_live_access_settings()
    next_signature = _build_live_signature(access)
    with _runtime_lock:
        previous_signature = _runtime_state.live_signature
        _runtime_state.live_signature = next_signature
    return previous_signature is not None and previous_signature != next_signature


def is_authenticated_session(
    session: Mapping[str, Any] | None,
    access: AccessSettings | None = None,
) -> bool:
    if session is None:
        return False
    current_access = access or _read_live_access_settings()
    if not is_access_configured(current_access):
        return False
    raw_generation = session.get(ACCESS_SESSION_KEY)
    if isinstance(raw_generation, bool) or not isinstance(raw_generation, int):
        return False
    return raw_generation == current_access.session_generation


def build_access_state_payload(
    session: Mapping[str, Any] | None,
) -> dict[str, object]:
    access = _read_live_access_settings()
    with _runtime_lock:
        bootstrap_generated = _runtime_state.bootstrap_generated
    configured = is_access_configured(access)
    return {
        "authenticated": is_authenticated_session(session, access),
        "configured": configured,
        "bootstrap_generated": configured and bootstrap_generated,
        "requires_restart": not configured,
    }


def access_request_is_public(path: str) -> bool:
    return path in ACCESS_PUBLIC_PATHS


class AccessControlMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api") or access_request_is_public(path):
            return await call_next(request)
        if is_authenticated_session(request.session):
            return await call_next(request)
        return JSONResponse({"detail": "Access denied"}, status_code=401)


async def authorize_websocket(ws: WebSocket) -> bool:
    if is_authenticated_session(ws.scope.get("session")):
        return True
    await ws.close(code=4401, reason="Access denied")
    return False


def reset_local_access() -> str:
    from app.events import event_bus

    settings = get_settings()
    clear_access_code(settings)
    save_settings(settings)
    initialize_live_access_signature()
    event_bus.close_all_connections(code=4001, reason="Access session reset")
    return (
        "Access configuration cleared. Restart Autopoe to generate a new access code."
    )


def refresh_local_access() -> str:
    from app.events import event_bus

    settings = get_settings()
    next_code = generate_access_code()
    set_access_code(settings, next_code)
    save_settings(settings)
    initialize_live_access_signature()
    event_bus.close_all_connections(code=4001, reason="Access session refreshed")
    return f"Generated new access code: {next_code}"


__all__ = [
    "ACCESS_SESSION_KEY",
    "AccessControlMiddleware",
    "authorize_websocket",
    "build_access_state_payload",
    "clear_access_code",
    "ensure_access_bootstrap",
    "ensure_session_signing_secret",
    "initialize_live_access_signature",
    "is_access_configured",
    "is_authenticated_session",
    "refresh_live_access_signature",
    "refresh_local_access",
    "reset_local_access",
    "set_access_code",
    "verify_access_code",
]
