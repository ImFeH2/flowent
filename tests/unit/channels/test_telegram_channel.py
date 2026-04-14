import asyncio

import pytest

from app.channels.telegram import (
    IMAGE_INPUT_UNSUPPORTED_MESSAGE,
    IMAGE_OUTPUT_UNSUPPORTED_MESSAGE,
    PRIVATE_ONLY_MESSAGE,
    TelegramChannel,
)
from app.models import Event, EventType
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

    def supports_input_image(self) -> bool:
        return True


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


def test_telegram_channel_rejects_image_input_from_approved_private_chat(monkeypatch):
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
    sent_messages: list[tuple[int, str, bool]] = []

    monkeypatch.setattr("app.channels.telegram.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.channels.telegram.registry.get_assistant",
        lambda: assistant,
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
                    "from": {"id": 1001},
                    "chat": {"id": 4004, "type": "private"},
                    "caption": "look at this",
                    "photo": [{"file_id": "photo-1"}],
                }
            }
        )
    )

    assert assistant.messages == []
    assert sent_messages == [(4004, IMAGE_INPUT_UNSUPPORTED_MESSAGE, False)]


def test_telegram_channel_sends_typing_while_running_before_first_visible_text(
    monkeypatch,
):
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
    sent_actions: list[tuple[int, str]] = []

    monkeypatch.setattr("app.channels.telegram.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.channels.telegram.registry.get_assistant",
        lambda: assistant,
    )

    channel = TelegramChannel()

    async def fake_send_chat_action(chat_id: int, *, action: str) -> None:
        sent_actions.append((chat_id, action))

    async def fake_sleep(_: float) -> None:
        channel._assistant_running = False

    monkeypatch.setattr(channel, "_send_chat_action", fake_send_chat_action)
    monkeypatch.setattr("app.channels.telegram.asyncio.sleep", fake_sleep)

    async def run_test() -> None:
        await channel._process_event(
            Event(
                type=EventType.NODE_STATE_CHANGED,
                agent_id=assistant.uuid,
                data={"new_state": "running"},
            )
        )
        assert channel._typing_task is not None
        await channel._typing_task

    asyncio.run(run_test())

    assert sent_actions == [(4004, "typing")]


def test_telegram_channel_stops_typing_after_first_visible_text(monkeypatch):
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
    sent_messages: list[tuple[int, str, bool]] = []
    sent_actions: list[tuple[int, str]] = []

    monkeypatch.setattr("app.channels.telegram.get_settings", lambda: settings)

    channel = TelegramChannel()

    async def fake_send_message(chat_id: int, text: str, *, markdown: bool) -> int:
        sent_messages.append((chat_id, text, markdown))
        return 7

    async def fake_send_chat_action(chat_id: int, *, action: str) -> None:
        sent_actions.append((chat_id, action))

    monkeypatch.setattr(channel, "_send_message", fake_send_message)
    monkeypatch.setattr(channel, "_send_chat_action", fake_send_chat_action)

    async def run_test() -> None:
        channel._assistant_running = True
        await channel._handle_assistant_content("hello")
        await channel._send_typing_feedback_once()

    asyncio.run(run_test())

    assert sent_messages == [(4004, "hello", False)]
    assert sent_actions == []
    assert channel._stream_message_ids == {4004: 7}


def test_telegram_channel_sends_explicit_notice_for_image_output(monkeypatch):
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
    sent_messages: list[tuple[int, str, bool]] = []

    monkeypatch.setattr("app.channels.telegram.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.channels.telegram.registry.get_assistant",
        lambda: assistant,
    )

    channel = TelegramChannel()

    async def fake_send_message(chat_id: int, text: str, *, markdown: bool) -> int:
        sent_messages.append((chat_id, text, markdown))
        return 1

    monkeypatch.setattr(channel, "_send_message", fake_send_message)

    asyncio.run(
        channel._process_event(
            Event(
                type=EventType.HISTORY_ENTRY_ADDED,
                agent_id=assistant.uuid,
                data={
                    "type": "AssistantText",
                    "parts": [{"type": "image", "asset_id": "asset-1"}],
                },
            )
        )
    )

    assert sent_messages == [(4004, IMAGE_OUTPUT_UNSUPPORTED_MESSAGE, False)]


def test_telegram_channel_ignores_tool_progress_events(monkeypatch):
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
    broadcast_messages: list[str] = []

    monkeypatch.setattr("app.channels.telegram.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.channels.telegram.registry.get_assistant",
        lambda: assistant,
    )

    channel = TelegramChannel()

    async def fake_send_message(chat_id: int, text: str, *, markdown: bool) -> int:
        broadcast_messages.append(text)
        return 1

    monkeypatch.setattr(channel, "_send_message", fake_send_message)

    asyncio.run(
        channel._process_event(
            Event(
                type=EventType.TOOL_CALLED,
                agent_id=assistant.uuid,
                data={"tool": "read"},
            )
        )
    )

    assert broadcast_messages == []


@pytest.mark.parametrize("end_state", ["idle", "error", "terminated"])
def test_telegram_channel_stops_without_placeholder_when_running_ends_no_content(
    monkeypatch,
    end_state,
):
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
    sent_messages: list[tuple[int, str, bool]] = []
    sent_actions: list[tuple[int, str]] = []

    monkeypatch.setattr("app.channels.telegram.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.channels.telegram.registry.get_assistant",
        lambda: assistant,
    )

    channel = TelegramChannel()

    async def fake_send_message(chat_id: int, text: str, *, markdown: bool) -> int:
        sent_messages.append((chat_id, text, markdown))
        return 1

    async def fake_send_chat_action(chat_id: int, *, action: str) -> None:
        sent_actions.append((chat_id, action))

    async def fake_sleep(_: float) -> None:
        await channel._process_event(
            Event(
                type=EventType.NODE_STATE_CHANGED,
                agent_id=assistant.uuid,
                data={"new_state": end_state},
            )
        )

    monkeypatch.setattr(channel, "_send_message", fake_send_message)
    monkeypatch.setattr(channel, "_send_chat_action", fake_send_chat_action)
    monkeypatch.setattr("app.channels.telegram.asyncio.sleep", fake_sleep)

    async def run_test() -> None:
        await channel._process_event(
            Event(
                type=EventType.NODE_STATE_CHANGED,
                agent_id=assistant.uuid,
                data={"new_state": "running"},
            )
        )
        assert channel._typing_task is not None
        await channel._typing_task

    asyncio.run(run_test())

    assert sent_actions == [(4004, "typing")]
    assert sent_messages == []
    assert channel._stream_message_ids == {}


def test_telegram_channel_stop_cancels_typing_task_on_app_loop(monkeypatch):
    cancelled: list[str] = []

    class FakeTask:
        def cancel(self) -> None:
            cancelled.append("typing")

    class FakeLoop:
        def __init__(self) -> None:
            self.calls: list[str] = []

        def is_closed(self) -> bool:
            return False

        def call_soon_threadsafe(self, callback) -> None:
            self.calls.append(callback.__name__)
            callback()

    monkeypatch.setattr("app.channels.telegram.event_bus.unsubscribe", lambda _: None)

    channel = TelegramChannel()
    app_loop = FakeLoop()
    polling_loop = FakeLoop()
    channel._app_loop = app_loop
    channel._thread_loop = polling_loop
    channel._typing_task = FakeTask()

    channel.stop()

    assert app_loop.calls == ["cancel"]
    assert polling_loop.calls == []
    assert cancelled == ["typing"]


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
