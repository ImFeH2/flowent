from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.graph_service import is_tab_leader, list_node_connection_ids
from app.registry import registry
from app.settings import find_provider, find_role, get_settings, resolve_model_info
from app.tools import MINIMUM_TOOLS
from app.workspace_store import workspace_store

router = APIRouter()


class DispatchNodeMessageRequest(BaseModel):
    content: str
    from_id: str = "human"


def _serialize_model_capabilities(role_name: str | None) -> dict[str, bool] | None:
    settings = get_settings()
    provider_id = settings.model.active_provider_id
    model_id = settings.model.active_model
    use_system_model_overrides = True
    role_cfg = find_role(settings, role_name) if role_name else None
    if (
        role_cfg is not None
        and role_cfg.model is not None
        and role_cfg.model.provider_id
        and role_cfg.model.model
    ):
        provider_id = role_cfg.model.provider_id
        model_id = role_cfg.model.model
        use_system_model_overrides = False
    if not provider_id or not model_id:
        return None
    provider = find_provider(settings, provider_id)
    if provider is None:
        return None
    model_info = resolve_model_info(
        provider=provider,
        model_id=model_id,
        input_image=settings.model.input_image if use_system_model_overrides else None,
        output_image=(
            settings.model.output_image if use_system_model_overrides else None
        ),
        context_window_tokens=(
            settings.model.context_window_tokens if use_system_model_overrides else None
        ),
    )
    return {
        "input_image": model_info.capabilities.input_image,
        "output_image": model_info.capabilities.output_image,
    }


@router.get("/api/nodes")
async def list_nodes() -> dict:
    nodes_by_id: dict[str, dict[str, object]] = {}

    assistant = registry.get_assistant()
    if assistant is not None:
        nodes_by_id[assistant.uuid] = {
            "id": assistant.uuid,
            "node_type": assistant.config.node_type.value,
            "tab_id": assistant.config.tab_id,
            "role_name": assistant.config.role_name,
            "state": assistant.state.value,
            "connections": assistant.get_connections_snapshot(),
            "name": assistant.config.name,
            "is_leader": False,
            "todos": [t.serialize() for t in assistant.todos],
            "capabilities": _serialize_model_capabilities(assistant.config.role_name),
            "position": None,
        }

    for record in workspace_store.list_node_records():
        live = registry.get(record.id)
        nodes_by_id[record.id] = {
            "id": record.id,
            "node_type": record.config.node_type.value,
            "tab_id": record.config.tab_id,
            "role_name": record.config.role_name,
            "is_leader": is_tab_leader(node_id=record.id, tab_id=record.config.tab_id),
            "state": (live.state if live is not None else record.state).value,
            "connections": (
                list_node_connection_ids(
                    tab_id=record.config.tab_id,
                    node_id=record.id,
                )
                if record.config.tab_id
                else []
            ),
            "name": record.config.name,
            "todos": [
                todo.serialize()
                for todo in (
                    live.get_todos_snapshot() if live is not None else record.todos
                )
            ],
            "capabilities": _serialize_model_capabilities(record.config.role_name),
            "position": record.position.serialize()
            if record.position is not None
            else None,
        }

    for node in registry.get_all():
        if node.uuid in nodes_by_id:
            continue
        nodes_by_id[node.uuid] = {
            "id": node.uuid,
            "node_type": node.config.node_type.value,
            "tab_id": node.config.tab_id,
            "role_name": node.config.role_name,
            "is_leader": is_tab_leader(node_id=node.uuid, tab_id=node.config.tab_id),
            "state": node.state.value,
            "connections": (
                list_node_connection_ids(
                    tab_id=node.config.tab_id,
                    node_id=node.uuid,
                )
                if node.config.tab_id
                else node.get_connections_snapshot()
            ),
            "name": node.config.name,
            "todos": [t.serialize() for t in node.todos],
            "capabilities": _serialize_model_capabilities(node.config.role_name),
            "position": None,
        }

    return {
        "nodes": list(nodes_by_id.values()),
    }


@router.get("/api/nodes/{node_id}")
async def get_node(node_id: str) -> dict:
    node = registry.get(node_id)
    record = workspace_store.get_node_record(node_id)

    if node is None and record is None:
        raise HTTPException(status_code=404, detail="Node not found")

    if node is not None:
        record_id = node.uuid
        record_state = node.state
        target_config = node.config
    else:
        assert record is not None
        record_id = record.id
        record_state = record.state
        target_config = record.config
    history = (
        node.get_history_snapshot()
        if node is not None
        else (record.history if record is not None else [])
    )
    todos = (
        node.get_todos_snapshot()
        if node is not None
        else (record.todos if record is not None else [])
    )

    return {
        "id": record_id,
        "node_type": target_config.node_type.value,
        "tab_id": target_config.tab_id,
        "role_name": target_config.role_name,
        "is_leader": is_tab_leader(node_id=record_id, tab_id=target_config.tab_id),
        "state": record_state.value,
        "contacts": node.get_contact_ids_snapshot() if node is not None else [],
        "connections": (
            list_node_connection_ids(
                tab_id=target_config.tab_id,
                node_id=record_id,
            )
            if target_config.tab_id
            else (node.get_connections_snapshot() if node is not None else [])
        ),
        "name": target_config.name,
        "todos": [t.serialize() for t in todos],
        "capabilities": _serialize_model_capabilities(target_config.role_name),
        "tools": sorted(set(target_config.tools) | set(MINIMUM_TOOLS)),
        "write_dirs": list(target_config.write_dirs),
        "allow_network": target_config.allow_network,
        "position": record.position.serialize()
        if record is not None and record.position is not None
        else None,
        "history": [entry.serialize() for entry in history],
    }


@router.post("/api/nodes/{node_id}/terminate")
async def terminate_node(node_id: str) -> dict:
    node = registry.get(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    from app.models import NodeType

    if node.config.node_type == NodeType.ASSISTANT:
        raise HTTPException(status_code=400, detail="Cannot terminate assistant")
    if is_tab_leader(node_id=node.uuid, tab_id=node.config.tab_id):
        raise HTTPException(
            status_code=400,
            detail="Cannot terminate a tab Leader directly",
        )

    node.request_termination("user_requested")
    return {"status": "terminating"}


@router.post("/api/nodes/{node_id}/interrupt")
async def interrupt_node(node_id: str) -> dict:
    node = registry.get(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    if not node.request_interrupt():
        return {"status": "ignored"}
    return {"status": "interrupting"}


@router.post("/api/nodes/{node_id}/clear-chat")
async def clear_node_chat(node_id: str) -> dict:
    from app.models import NodeType

    node = registry.get(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.config.node_type != NodeType.ASSISTANT:
        raise HTTPException(status_code=400, detail="Can only clear assistant chat")

    try:
        node.clear_chat_history()
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return {"status": "cleared"}


@router.post("/api/nodes/{node_id}/messages")
async def dispatch_node_message(node_id: str, req: DispatchNodeMessageRequest) -> dict:
    from app.graph_service import dispatch_node_message

    error = dispatch_node_message(
        node_id=node_id,
        content=req.content,
        from_id=req.from_id,
    )
    if error is not None:
        raise HTTPException(status_code=400, detail=error)
    return {"status": "sent"}
