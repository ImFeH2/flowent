from uuid import UUID

from app.models import AssistantText, LLMResponse, ReceivedMessage
from app.registry import registry


def _get_assistant_id(client) -> str:
    response = client.get("/api/assistant")

    assert response.status_code == 200
    assistant_id = response.json()["id"]
    UUID(assistant_id)
    return assistant_id


def test_help_command_returns_visible_command_feedback(client):
    assistant_id = _get_assistant_id(client)

    response = client.post("/api/assistant/message", json={"content": "/help"})

    assert response.status_code == 200
    assert response.json() == {
        "status": "command_executed",
        "command_name": "/help",
    }

    detail = client.get(f"/api/nodes/{assistant_id}").json()

    assert any(
        entry["type"] == "CommandResultEntry"
        and entry["command_name"] == "/help"
        and "/compact" in entry["content"]
        for entry in detail["history"]
    )
    assert not any(
        entry["type"] == "ReceivedMessage" and entry.get("content") == "/help"
        for entry in detail["history"]
    )


def test_clear_command_clears_history_and_appends_feedback(client):
    assistant_id = _get_assistant_id(client)
    assistant = registry.get(assistant_id)
    assert assistant is not None
    assistant.history.append(ReceivedMessage(content="Old message", from_id="human"))
    assistant.history.append(AssistantText(content="Old reply"))

    response = client.post("/api/assistant/message", json={"content": "/clear"})

    assert response.status_code == 200
    assert response.json() == {
        "status": "command_executed",
        "command_name": "/clear",
    }

    detail = client.get(f"/api/nodes/{assistant_id}").json()

    assert not any(
        entry["type"] in {"ReceivedMessage", "AssistantText"}
        and entry.get("content") in {"Old message", "Old reply"}
        for entry in detail["history"]
    )
    assert any(
        entry["type"] == "CommandResultEntry" and entry["command_name"] == "/clear"
        for entry in detail["history"]
    )


def test_compact_command_replaces_history_with_summary(monkeypatch, client):
    assistant_id = _get_assistant_id(client)
    assistant = registry.get(assistant_id)
    assert assistant is not None
    assistant.history.extend(
        [
            ReceivedMessage(content="Need a concise recap", from_id="human"),
            AssistantText(content="I will summarize the open work."),
        ]
    )

    monkeypatch.setattr(
        "app.agent.gateway.chat",
        lambda *args, **kwargs: LLMResponse(
            content=(
                "## Current Goal\nShip the slash commands.\n\n"
                "## Active Task Boundary\nKeep the fix limited to Assistant chat.\n\n"
                "## Key Constraints\nDo not lose persisted context.\n\n"
                "## Confirmed Decisions\nUse built-in commands only.\n\n"
                "## Open Questions\nNone.\n\n"
                "## Next Actions\nWire the UI and tests."
            )
        ),
    )

    response = client.post(
        "/api/assistant/message",
        json={"content": "/compact slash command rollout"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "command_executed",
        "command_name": "/compact",
    }

    detail = client.get(f"/api/nodes/{assistant_id}").json()

    assert not any(
        entry["type"] == "ReceivedMessage"
        and entry.get("content") == "Need a concise recap"
        for entry in detail["history"]
    )
    assert not any(
        entry["type"] == "AssistantText"
        and entry.get("content") == "I will summarize the open work."
        for entry in detail["history"]
    )
    assert any(
        entry["type"] == "CommandResultEntry"
        and entry["command_name"] == "/compact"
        and entry.get("include_in_context") is True
        and "Focus: slash command rollout" in entry["content"]
        and "Ship the slash commands." in entry["content"]
        for entry in detail["history"]
    )
