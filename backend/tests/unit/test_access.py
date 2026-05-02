from loguru import logger

from flowent.access import (
    ensure_access_bootstrap,
    is_access_configured,
    set_access_code,
)
from flowent.settings import Settings


def test_ensure_access_bootstrap_generates_and_logs_access_code() -> None:
    settings = Settings()
    messages: list[str] = []
    sink_id = logger.add(messages.append, format="{message}")

    try:
        generated_code = ensure_access_bootstrap(settings)
    finally:
        logger.remove(sink_id)

    assert generated_code
    assert settings.access.code == generated_code
    assert is_access_configured(settings.access)
    assert any(
        f"Flowent admin access code: {generated_code}" in message
        for message in messages
    )


def test_ensure_access_bootstrap_logs_existing_persisted_access_code() -> None:
    settings = Settings()
    set_access_code(settings, "TEST-ACCESS-CODE")
    messages: list[str] = []
    sink_id = logger.add(messages.append, format="{message}")

    try:
        generated_code = ensure_access_bootstrap(settings)
    finally:
        logger.remove(sink_id)

    assert generated_code is None
    assert settings.access.code == "TEST-ACCESS-CODE"
    assert any(
        "Flowent admin access code: TEST-ACCESS-CODE" in message for message in messages
    )
