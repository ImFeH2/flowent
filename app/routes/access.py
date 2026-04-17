from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.access import (
    ACCESS_SESSION_KEY,
    build_access_state_payload,
    is_access_configured,
    verify_access_code,
)

router = APIRouter()


class AccessLoginRequest(BaseModel):
    code: str = ""


@router.get("/api/access/state")
async def get_access_state(request: Request) -> dict[str, object]:
    return build_access_state_payload(request.session)


@router.post("/api/access/login")
async def login_access(
    payload: AccessLoginRequest,
    request: Request,
) -> dict[str, object]:
    from app.access import _read_live_access_settings

    access = _read_live_access_settings()
    if not is_access_configured(access):
        raise HTTPException(
            status_code=503,
            detail="Access code is not initialized. Restart Autopoe to generate a new access code.",
        )
    if not verify_access_code(access, payload.code):
        raise HTTPException(status_code=401, detail="Invalid access code")
    request.session.clear()
    request.session[ACCESS_SESSION_KEY] = access.session_generation
    return build_access_state_payload(request.session)


@router.post("/api/access/logout")
async def logout_access(request: Request) -> dict[str, object]:
    request.session.clear()
    return build_access_state_payload(request.session)
