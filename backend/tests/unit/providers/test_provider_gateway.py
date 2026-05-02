import pytest

from flowent.providers.errors import LLMProviderError
from flowent.providers.gateway import ProviderGateway
from flowent.settings import (
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
        "flowent.settings.get_settings",
        lambda: Settings(model=ModelSettings(active_provider_id="", active_model="")),
    )
    monkeypatch.setattr(
        "flowent.providers.registry.create_provider",
        lambda **kwargs: (_ for _ in ()).throw(
            AssertionError("create_provider should not be called")
        ),
    )

    with pytest.raises(RuntimeError, match="No active provider configured"):
        gateway.chat(messages=[])


def test_gateway_requires_active_model(monkeypatch):
    gateway = ProviderGateway()

    monkeypatch.setattr(
        "flowent.settings.get_settings",
        lambda: Settings(
            model=ModelSettings(active_provider_id="provider-1", active_model=""),
            providers=[
                ProviderConfig(
                    id="provider-1",
                    name="Default Provider",
                    type="openai_responses",
                    base_url="https://default.invalid/v1",
                    api_key="secret",
                )
            ],
        ),
    )
    monkeypatch.setattr(
        "flowent.providers.registry.create_provider",
        lambda **kwargs: (_ for _ in ()).throw(
            AssertionError("create_provider should not be called")
        ),
    )

    with pytest.raises(LLMProviderError, match="No active model configured"):
        gateway.chat(messages=[])


def test_gateway_prefers_role_model(monkeypatch):
    gateway = ProviderGateway()
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        "flowent.settings.get_settings",
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
        def chat(
            self,
            messages,
            tools=None,
            on_chunk=None,
            register_interrupt=None,
            model_params=None,
        ):
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
        "flowent.providers.registry.create_provider",
        lambda **kwargs: (
            captured.update(
                {
                    "provider_name": kwargs["provider_name"],
                    "model": kwargs["model"],
                    "request_timeout_seconds": kwargs["request_timeout_seconds"],
                }
            )
            or ProviderStub()
        ),
    )

    gateway.chat(messages=[], role_name="Reviewer")

    assert captured["provider_name"] == "Role Provider"
    assert captured["model"] == "gpt-role"
    assert captured["request_timeout_seconds"] == 10.0
    assert captured["reasoning_effort"] == "high"
    assert captured["verbosity"] == "medium"


def test_gateway_omits_model_params_when_all_values_are_empty(monkeypatch):
    gateway = ProviderGateway()
    captured: dict[str, bool] = {}

    monkeypatch.setattr(
        "flowent.settings.get_settings",
        lambda: Settings(
            model=ModelSettings(
                active_provider_id="provider-1",
                active_model="gpt-default",
                params=ModelParams(),
            ),
            providers=[
                ProviderConfig(
                    id="provider-1",
                    name="Default Provider",
                    type="openai_compatible",
                    base_url="https://default.invalid",
                    api_key="secret",
                )
            ],
        ),
    )

    class ProviderStub:
        def chat(
            self,
            messages,
            tools=None,
            on_chunk=None,
            register_interrupt=None,
            model_params=None,
        ):
            captured["is_none"] = model_params is None
            return type(
                "Response",
                (),
                {"content": "", "thinking": "", "tool_calls": []},
            )()

        def list_models(self):
            return []

    monkeypatch.setattr(
        "flowent.providers.registry.create_provider",
        lambda **kwargs: ProviderStub(),
    )

    gateway.chat(messages=[])

    assert captured["is_none"] is True


def test_gateway_passes_provider_headers_to_registry(monkeypatch):
    gateway = ProviderGateway()
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        "flowent.settings.get_settings",
        lambda: Settings(
            model=ModelSettings(
                active_provider_id="provider-1",
                active_model="gpt-default",
            ),
            providers=[
                ProviderConfig(
                    id="provider-1",
                    name="Default Provider",
                    type="openai_compatible",
                    base_url="https://default.invalid",
                    api_key="secret",
                    headers={"X-Test": "value"},
                )
            ],
        ),
    )

    class ProviderStub:
        def chat(
            self,
            messages,
            tools=None,
            on_chunk=None,
            register_interrupt=None,
            model_params=None,
        ):
            return type(
                "Response",
                (),
                {"content": "", "thinking": "", "tool_calls": []},
            )()

        def list_models(self):
            return []

    monkeypatch.setattr(
        "flowent.providers.registry.create_provider",
        lambda **kwargs: captured.update(kwargs) or ProviderStub(),
    )

    gateway.chat(messages=[])

    assert captured["headers"] == {"X-Test": "value"}


def test_gateway_list_models_does_not_reuse_model_timeout(monkeypatch):
    gateway = ProviderGateway()
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        "flowent.settings.get_settings",
        lambda: Settings(
            model=ModelSettings(
                active_provider_id="provider-1",
                active_model="gpt-default",
                timeout_ms=9000,
            ),
            providers=[
                ProviderConfig(
                    id="provider-1",
                    name="Default Provider",
                    type="openai_compatible",
                    base_url="https://default.invalid",
                    api_key="secret",
                )
            ],
        ),
    )

    class ProviderStub:
        def chat(
            self,
            messages,
            tools=None,
            on_chunk=None,
            register_interrupt=None,
            model_params=None,
        ):
            return type(
                "Response",
                (),
                {"content": "", "thinking": "", "tool_calls": []},
            )()

        def list_models(self, register_interrupt=None):
            return []

    monkeypatch.setattr(
        "flowent.providers.registry.create_provider",
        lambda **kwargs: captured.update(kwargs) or ProviderStub(),
    )

    gateway.list_models_for("provider-1")

    assert captured["request_timeout_seconds"] == 120.0


def test_gateway_passes_custom_timeout_to_chat_provider(monkeypatch):
    gateway = ProviderGateway()
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        "flowent.settings.get_settings",
        lambda: Settings(
            model=ModelSettings(
                active_provider_id="provider-1",
                active_model="gpt-default",
                timeout_ms=15000,
            ),
            providers=[
                ProviderConfig(
                    id="provider-1",
                    name="Default Provider",
                    type="openai_compatible",
                    base_url="https://default.invalid",
                    api_key="secret",
                )
            ],
        ),
    )

    class ProviderStub:
        def chat(
            self,
            messages,
            tools=None,
            on_chunk=None,
            register_interrupt=None,
            model_params=None,
        ):
            return type(
                "Response",
                (),
                {"content": "", "thinking": "", "tool_calls": []},
            )()

        def list_models(self, register_interrupt=None):
            return []

    monkeypatch.setattr(
        "flowent.providers.registry.create_provider",
        lambda **kwargs: captured.update(kwargs) or ProviderStub(),
    )

    gateway.chat(messages=[])

    assert captured["request_timeout_seconds"] == 15.0
