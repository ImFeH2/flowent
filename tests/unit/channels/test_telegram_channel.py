import asyncio

from app.channels.telegram import UNAUTHORIZED_MESSAGE, TelegramChannel
from app.settings import Settings, TelegramSettings


class DummyAssistant:
    def __init__(self) -> None:
        self.uuid = "assistant-1"
        self.messages: list[object] = []

    def enqueue_message(self, message) -> None:
        self.messages.append(message)


def test_telegram_channel_rejects_unauthorized_user(monkeypatch):
    settings = Settings(
        telegram=TelegramSettings(
            bot_token="123456:ABCDE",
            allowed_user_ids=[1001],
        )
    )
    sent_messages: list[tuple[int, str, bool]] = []

    monkeypatch.setattr("app.channels.telegram.get_settings", lambda: settings)

    channel = TelegramChannel()

    async def fake_send_message(chat_id: int, text: str, *, markdown: bool) -> int:
        sent_messages.append((chat_id, text, markdown))
        return 1

    monkeypatch.setattr(channel, "_send_message", fake_send_message)

    asyncio.run(
        channel._process_update(
            {
                "message": {
                    "from": {"id": 2002},
                    "chat": {"id": 3003},
                    "text": "hello",
                }
            }
        )
    )

    assert sent_messages == [(3003, UNAUTHORIZED_MESSAGE, False)]
    assert settings.telegram.registered_chat_ids == []


def test_telegram_channel_registers_chat_and_enqueues_message(monkeypatch):
    settings = Settings(
        telegram=TelegramSettings(
            bot_token="123456:ABCDE",
            allowed_user_ids=[1001],
        )
    )
    saved: list[Settings] = []
    assistant = DummyAssistant()

    monkeypatch.setattr("app.channels.telegram.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.channels.telegram.save_settings",
        lambda current: saved.append(current),
    )
    monkeypatch.setattr(
        "app.channels.telegram.registry.get_assistant",
        lambda: assistant,
    )

    channel = TelegramChannel()

    asyncio.run(
        channel._process_update(
            {
                "message": {
                    "from": {"id": 1001},
                    "chat": {"id": 4004},
                    "text": "check status",
                }
            }
        )
    )

    assert settings.telegram.registered_chat_ids == [4004]
    assert saved == [settings]
    assert len(assistant.messages) == 1
    assert assistant.messages[0].from_id == "human"
    assert assistant.messages[0].to_id == assistant.uuid
    assert assistant.messages[0].content == "check status"
