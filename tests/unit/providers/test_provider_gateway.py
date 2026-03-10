import pytest

from app.providers.gateway import ProviderGateway
from app.settings import ModelSettings, Settings


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
