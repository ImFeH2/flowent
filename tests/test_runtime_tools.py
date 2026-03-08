from app.agent import Agent
from app.registry import registry
from app.runtime import bootstrap_runtime


def test_bootstrap_runtime_adds_list_roles_to_conductor(monkeypatch):
    registry.reset()
    monkeypatch.setattr(Agent, "start", lambda self: None)

    bootstrap_runtime()

    try:
        conductor = registry.get("conductor")

        assert conductor is not None
        assert "list_roles" in conductor.config.tools
    finally:
        registry.reset()
