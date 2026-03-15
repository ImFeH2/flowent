import pytest

from app.providers.gateway import ProviderGateway
from app.settings import (
    ModelParams,
    ModelSettings,
    ProviderConfig,
    RoleConfig,
    RoleModelConfig,
    Settings,
)


def test_gateway_requires_active_provider(monkeypatch):
    gateway = ProviderGateway()

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(model=ModelSettings(active_provider_id="", active_model="")),
    )
    monkeypatch.setattr(
        "app.providers.registry.create_provider",
        lambda **kwargs: (_ for _ in ()).throw(
            AssertionError("create_provider should not be called")
        ),
    )

    with pytest.raises(RuntimeError, match="No active provider configured"):
        gateway.chat(messages=[])


def test_gateway_prefers_role_model(monkeypatch):
    gateway = ProviderGateway()
    captured: dict[str, str] = {}

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            model=ModelSettings(
                active_provider_id="provider-1",
                active_model="gpt-default",
                params=ModelParams(
                    reasoning_effort="medium",
                    verbosity="medium",
                ),
            ),
            providers=[
                ProviderConfig(
                    id="provider-1",
                    name="Default Provider",
                    type="openai_compatible",
                    base_url="https://default.invalid",
                    api_key="secret",
                ),
                ProviderConfig(
                    id="provider-2",
                    name="Role Provider",
                    type="openai_compatible",
                    base_url="https://role.invalid",
                    api_key="secret",
                ),
            ],
            roles=[
                RoleConfig(
                    name="Reviewer",
                    system_prompt="Review carefully.",
                    model=RoleModelConfig(
                        provider_id="provider-2",
                        model="gpt-role",
                    ),
                    model_params=ModelParams(
                        reasoning_effort="high",
                    ),
                )
            ],
        ),
    )

    class ProviderStub:
        def chat(self, messages, tools=None, on_chunk=None, model_params=None):
            captured["message_count"] = str(len(messages))
            captured["reasoning_effort"] = str(model_params.reasoning_effort)
            captured["verbosity"] = str(model_params.verbosity)
            return type(
                "Response",
                (),
                {"content": "", "thinking": "", "tool_calls": []},
            )()

        def list_models(self):
            return []

    monkeypatch.setattr(
        "app.providers.registry.create_provider",
        lambda **kwargs: (
            captured.update(
                {
                    "provider_name": kwargs["provider_name"],
                    "model": kwargs["model"],
                }
            )
            or ProviderStub()
        ),
    )

    gateway.chat(messages=[], role_name="Reviewer")

    assert captured["provider_name"] == "Role Provider"
    assert captured["model"] == "gpt-role"
    assert captured["reasoning_effort"] == "high"
    assert captured["verbosity"] == "medium"
