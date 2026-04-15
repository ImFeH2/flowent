from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException, Query

from app.graph_service import is_tab_leader
from app.registry import registry
from app.settings import find_provider, find_role, get_settings
from app.stats_service import stats_store
from app.workspace_store import workspace_store

router = APIRouter()

RANGE_WINDOWS_SECONDS: dict[str, int] = {
    "1h": 60 * 60,
    "24h": 24 * 60 * 60,
    "7d": 7 * 24 * 60 * 60,
    "30d": 30 * 24 * 60 * 60,
}


def _resolve_range_window(range_value: str) -> int:
    window = RANGE_WINDOWS_SECONDS.get(range_value)
    if window is None:
        raise HTTPException(
            status_code=400,
            detail="range must be one of: 1h, 24h, 7d, 30d",
        )
    return window


def _build_node_label(
    *,
    name: str | None,
    role_name: str | None,
    node_type: str,
    is_leader: bool,
) -> str:
    if name:
        return name
    if role_name:
        return role_name
    if node_type == "assistant":
        return "Assistant"
    if is_leader:
        return "Leader"
    return "Agent"


def _serialize_tab_snapshots() -> list[dict[str, object]]:
    return [
        {
            "id": tab.id,
            "title": tab.title,
            "goal": tab.goal,
            "leader_id": tab.leader_id,
            "created_at": tab.created_at,
            "updated_at": tab.updated_at,
        }
        for tab in workspace_store.list_tabs()
    ]


def _resolve_current_model_source(role_name: str | None) -> dict[str, str | None]:
    settings = get_settings()
    provider_id = settings.model.active_provider_id
    model = settings.model.active_model
    role_cfg = find_role(settings, role_name) if role_name else None
    if (
        role_cfg is not None
        and role_cfg.model is not None
        and role_cfg.model.provider_id
        and role_cfg.model.model
    ):
        provider_id = role_cfg.model.provider_id
        model = role_cfg.model.model
    if not provider_id:
        return {
            "provider_id": None,
            "provider_name": None,
            "provider_type": None,
            "model": model or None,
        }
    provider = find_provider(settings, provider_id)
    if provider is None:
        return {
            "provider_id": provider_id,
            "provider_name": None,
            "provider_type": None,
            "model": model or None,
        }
    return {
        "provider_id": provider.id,
        "provider_name": provider.name,
        "provider_type": provider.type,
        "model": model or None,
    }


def _serialize_node_snapshots(
    tab_titles: dict[str, str],
) -> list[dict[str, object]]:
    nodes_by_id: dict[str, dict[str, object]] = {}

    assistant = registry.get_assistant()
    if assistant is not None:
        model_source = _resolve_current_model_source(assistant.config.role_name)
        nodes_by_id[assistant.uuid] = {
            "id": assistant.uuid,
            "label": _build_node_label(
                name=assistant.config.name,
                role_name=assistant.config.role_name,
                node_type=assistant.config.node_type.value,
                is_leader=False,
            ),
            "name": assistant.config.name,
            "role_name": assistant.config.role_name,
            "node_type": assistant.config.node_type.value,
            "is_leader": False,
            "state": assistant.state.value,
            "tab_id": None,
            "tab_title": None,
            **model_source,
        }

    for record in workspace_store.list_node_records():
        live = registry.get(record.id)
        is_leader = is_tab_leader(node_id=record.id, tab_id=record.config.tab_id)
        model_source = _resolve_current_model_source(record.config.role_name)
        nodes_by_id[record.id] = {
            "id": record.id,
            "label": _build_node_label(
                name=record.config.name,
                role_name=record.config.role_name,
                node_type=record.config.node_type.value,
                is_leader=is_leader,
            ),
            "name": record.config.name,
            "role_name": record.config.role_name,
            "node_type": record.config.node_type.value,
            "is_leader": is_leader,
            "state": (live.state if live is not None else record.state).value,
            "tab_id": record.config.tab_id,
            "tab_title": (
                tab_titles.get(record.config.tab_id)
                if record.config.tab_id is not None
                else None
            ),
            **model_source,
        }

    for node in registry.get_all():
        if node.uuid in nodes_by_id:
            continue
        is_leader = is_tab_leader(node_id=node.uuid, tab_id=node.config.tab_id)
        model_source = _resolve_current_model_source(node.config.role_name)
        nodes_by_id[node.uuid] = {
            "id": node.uuid,
            "label": _build_node_label(
                name=node.config.name,
                role_name=node.config.role_name,
                node_type=node.config.node_type.value,
                is_leader=is_leader,
            ),
            "name": node.config.name,
            "role_name": node.config.role_name,
            "node_type": node.config.node_type.value,
            "is_leader": is_leader,
            "state": node.state.value,
            "tab_id": node.config.tab_id,
            "tab_title": (
                tab_titles.get(node.config.tab_id)
                if node.config.tab_id is not None
                else None
            ),
            **model_source,
        }

    return list(nodes_by_id.values())


@router.get("/api/stats")
async def get_stats(range: str = Query("24h")) -> dict[str, object]:
    window_seconds = _resolve_range_window(range)
    now = time.time()
    since = now - window_seconds
    tabs = _serialize_tab_snapshots()
    tab_titles: dict[str, str] = {}
    for tab in tabs:
        tab_id = tab.get("id")
        tab_title = tab.get("title")
        if isinstance(tab_id, str) and isinstance(tab_title, str):
            tab_titles[tab_id] = tab_title

    return {
        "requested_at": now,
        "range": range,
        "tabs": tabs,
        "nodes": _serialize_node_snapshots(tab_titles),
        "requests": stats_store.list_requests(since=since),
        "compacts": stats_store.list_compacts(since=since),
    }
