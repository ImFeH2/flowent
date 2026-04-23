import asyncio

import pytest
from fastapi import HTTPException

from app.agent import Agent
from app.models import AgentState, NodeConfig, NodeType, Tab
from app.registry import registry
from app.routes.stats import get_stats
from app.settings import ModelSettings, ProviderConfig, Settings
from app.stats_service import CompactRecordInput, RequestRecordInput, stats_store
from app.workspace_store import workspace_store


@pytest.fixture(autouse=True)
def reset_stats_route_state(monkeypatch, tmp_path):
    import app.settings as settings_module

    settings_file = tmp_path / "settings.json"
    settings_file.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)
    registry.reset()
    workspace_store.reset_cache()
    stats_store.reset()
    yield
    registry.reset()
    workspace_store.reset_cache()
    stats_store.reset()
    monkeypatch.setattr(settings_module, "_cached_settings", None)


def test_get_stats_returns_current_snapshots_and_recent_records(monkeypatch):
    settings = Settings(
        model=ModelSettings(
            active_provider_id="provider-1",
            active_model="gpt-5.2",
        ),
        providers=[
            ProviderConfig(
                id="provider-1",
                name="Primary",
                type="openai_responses",
                base_url="https://api.example.com/v1",
                api_key="secret",
            )
        ],
    )
    monkeypatch.setattr("app.routes.stats.get_settings", lambda: settings)

    workspace_store.upsert_tab(Tab(id="tab-1", title="Main Task", leader_id="leader-1"))
    leader = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tab_id="tab-1",
            name="Leader",
        ),
        uuid="leader-1",
    )
    leader.prime_runtime_state(AgentState.RUNNING)
    registry.register(leader)

    now = 1_760_000_000.0
    monkeypatch.setattr("app.routes.stats.time.time", lambda: now)
    stats_store.record_request(
        RequestRecordInput(
            node_id="leader-1",
            node_label="Leader",
            role_name="Conductor",
            tab_id="tab-1",
            tab_title="Main Task",
            provider_id="provider-1",
            provider_name="Primary",
            provider_type="openai_responses",
            model="gpt-5.2",
            started_at=now - 60,
            ended_at=now - 58,
            retry_count=1,
            result="success",
            raw_usage={"total_tokens": 120},
        )
    )
    stats_store.record_compact(
        CompactRecordInput(
            node_id="leader-1",
            node_label="Leader",
            role_name="Conductor",
            tab_id="tab-1",
            tab_title="Main Task",
            provider_id="provider-1",
            provider_name="Primary",
            provider_type="openai_responses",
            model="gpt-5.2",
            trigger_type="auto",
            started_at=now - 30,
            ended_at=now - 29,
            result="success",
        )
    )
    stats_store.record_request(
        RequestRecordInput(
            node_id="leader-1",
            node_label="Leader",
            role_name="Conductor",
            tab_id="tab-1",
            tab_title="Main Task",
            provider_id="provider-1",
            provider_name="Primary",
            provider_type="openai_responses",
            model="gpt-5.2",
            started_at=now - 40 * 24 * 60 * 60,
            ended_at=now - 40 * 24 * 60 * 60 + 1,
            retry_count=0,
            result="error",
            error_summary="too old",
        )
    )

    result = asyncio.run(get_stats(range="24h"))

    assert result["range"] == "24h"
    assert len(result["workflows"]) == 1
    assert result["workflows"][0]["title"] == "Main Task"
    assert len(result["nodes"]) == 1
    assert result["nodes"][0]["id"] == "leader-1"
    assert result["nodes"][0]["state"] == "running"
    assert result["nodes"][0]["workflow_id"] == "tab-1"
    assert result["nodes"][0]["provider_id"] == "provider-1"
    assert result["nodes"][0]["model"] == "gpt-5.2"
    assert len(result["requests"]) == 1
    assert result["requests"][0]["retry_count"] == 1
    assert result["requests"][0]["workflow_id"] == "tab-1"
    assert result["requests"][0]["raw_usage"] == {"total_tokens": 120}
    assert len(result["compacts"]) == 1
    assert result["compacts"][0]["trigger_type"] == "auto"
    assert result["compacts"][0]["workflow_id"] == "tab-1"


def test_get_stats_rejects_invalid_range():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_stats(range="12h"))

    assert exc.value.status_code == 400
    assert exc.value.detail == "range must be one of: 1h, 24h, 7d, 30d"
