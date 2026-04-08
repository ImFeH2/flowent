import asyncio

from app.channels.telegram import PRIVATE_ONLY_MESSAGE, TelegramChannel
from app.settings import (
    Settings,
    TelegramApprovedChat,
    TelegramPendingChat,
    TelegramSettings,
)


class DummyAssistant:
    def __init__(self) -> None:
        self.uuid = "assistant-1"
        self.messages: list[object] = []

    def enqueue_message(self, message) -> None:
        self.messages.append(message)


class _FakeTelegramResponse:
    def __init__(self, status_code: int, payload: dict[str, object]) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict[str, object]:
        return self._payload


class _FakeAsyncSession:
    def __init__(self, response: _FakeTelegramResponse) -> None:
        self._response = response
        self.requests: list[tuple[str, dict[str, object]]] = []

    async def __aenter__(self) -> "_FakeAsyncSession":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False

    async def post(self, url: str, data: dict[str, object]):
        self.requests.append((url, data))
        return self._response


def test_telegram_channel_replies_with_private_only_message_for_group_chat(
    monkeypatch,
):
    settings = Settings(telegram=TelegramSettings(bot_token="123456:ABCDE"))
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
                    "chat": {"id": -3003, "type": "group"},
                    "text": "hello",
                }
            }
        )
    )

    assert sent_messages == [(-3003, PRIVATE_ONLY_MESSAGE, False)]


def test_telegram_channel_tracks_pending_private_chat_and_replies_with_chat_id(
    monkeypatch,
):
    settings = Settings(telegram=TelegramSettings(bot_token="123456:ABCDE"))
    saved: list[Settings] = []
    sent_messages: list[tuple[int, str, bool]] = []

    monkeypatch.setattr("app.channels.telegram.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.channels.telegram.save_settings",
        lambda current: saved.append(current),
    )

    channel = TelegramChannel()

    async def fake_send_message(chat_id: int, text: str, *, markdown: bool) -> int:
        sent_messages.append((chat_id, text, markdown))
        return 1

    monkeypatch.setattr(channel, "_send_message", fake_send_message)

    asyncio.run(
        channel._process_update(
            {
                "message": {
                    "from": {
                        "id": 2002,
                        "username": "alice",
                        "first_name": "Alice",
                    },
                    "chat": {"id": 3003, "type": "private"},
                    "text": "hello",
                }
            }
        )
    )

    assert len(saved) == 1
    assert settings.telegram.pending_chats == [
        TelegramPendingChat(
            chat_id=3003,
            username="alice",
            display_name="Alice",
            first_seen_at=settings.telegram.pending_chats[0].first_seen_at,
            last_seen_at=settings.telegram.pending_chats[0].last_seen_at,
        )
    ]
    assert sent_messages == [
        (
            3003,
            "⏳ This chat is pending approval in Autopoe.\nChat ID: `3003`",
            True,
        )
    ]


def test_telegram_channel_delivers_messages_from_approved_private_chat(monkeypatch):
    settings = Settings(
        telegram=TelegramSettings(
            bot_token="123456:ABCDE",
            approved_chats=[
                TelegramApprovedChat(
                    chat_id=4004,
                    username="alice",
                    display_name="Alice",
                    approved_at=1.0,
                )
            ],
        )
    )
    assistant = DummyAssistant()

    monkeypatch.setattr("app.channels.telegram.get_settings", lambda: settings)
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
                    "chat": {"id": 4004, "type": "private"},
                    "text": "check status",
                }
            }
        )
    )

    assert len(assistant.messages) == 1
    assert assistant.messages[0].from_id == "human"
    assert assistant.messages[0].to_id == assistant.uuid
    assert assistant.messages[0].content == "check status"


def test_telegram_channel_call_api_uses_shared_async_transport(monkeypatch):
    settings = Settings(telegram=TelegramSettings(bot_token="123456:ABCDE"))
    fake_session = _FakeAsyncSession(
        _FakeTelegramResponse(200, {"ok": True, "result": {"message_id": 1}})
    )

    monkeypatch.setattr("app.channels.telegram.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.channels.telegram.create_async_http_session",
        lambda timeout: fake_session,
    )

    channel = TelegramChannel()

    result = asyncio.run(
        channel._call_api(
            "sendMessage",
            {"chat_id": 3003, "text": "hello"},
            parse_mode="Markdown",
        )
    )

    assert result == {"message_id": 1}
    assert fake_session.requests == [
        (
            "https://api.telegram.org/bot123456:ABCDE/sendMessage",
            {"chat_id": 3003, "text": "hello", "parse_mode": "Markdown"},
        )
    ]
