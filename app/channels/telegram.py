from __future__ import annotations

import asyncio
import threading
import time
from typing import Any

import httpx
from loguru import logger

from app.events import event_bus
from app.models import Event, EventType, Message
from app.registry import registry
from app.settings import get_settings, save_settings

TELEGRAM_API_BASE_URL = "https://api.telegram.org"
TELEGRAM_LONG_POLL_TIMEOUT_SECONDS = 30
TELEGRAM_REQUEST_TIMEOUT_SECONDS = 35
TELEGRAM_EDIT_INTERVAL_SECONDS = 1.0
TELEGRAM_EDIT_THRESHOLD_CHARS = 100
TELEGRAM_MAX_TEXT_LENGTH = 4000
UNAUTHORIZED_MESSAGE = "⛔ You are not authorized."
PLACEHOLDER_MESSAGE = "…"


class TelegramChannel:
    def __init__(self) -> None:
        settings = get_settings()
        self._bot_token = settings.telegram.bot_token.strip()
        self._app_loop = event_bus.get_loop()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._thread_loop: asyncio.AbstractEventLoop | None = None
        self._polling_task: asyncio.Task[None] | None = None
        self._offset: int | None = None
        self._event_lock: asyncio.Lock | None = None
        self._stream_buffer = ""
        self._stream_message_ids: dict[int, int] = {}
        self._last_edit_at = 0.0
        self._last_sent_length = 0

    def start(self) -> None:
        if not self._bot_token:
            logger.info("Telegram channel not started: bot token is empty")
            return
        if self._thread is not None and self._thread.is_alive():
            return

        self._app_loop = event_bus.get_loop()
        if self._app_loop is None or self._app_loop.is_closed():
            raise RuntimeError("Event loop is not available for Telegram channel")

        self._stop_event.clear()
        self._offset = None
        self._event_lock = None
        self._stream_buffer = ""
        self._stream_message_ids = {}
        self._last_edit_at = 0.0
        self._last_sent_length = 0

        event_bus.subscribe(self._on_event)
        self._thread = threading.Thread(
            target=self._run_polling_thread,
            name="telegram-channel",
            daemon=True,
        )
        self._thread.start()
        logger.info("Telegram channel started")

    def stop(self) -> None:
        event_bus.unsubscribe(self._on_event)
        self._stop_event.set()

        loop = self._thread_loop
        task = self._polling_task
        if loop is not None and task is not None:
            loop.call_soon_threadsafe(task.cancel)

        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=5.0)

        self._thread = None
        self._thread_loop = None
        self._polling_task = None
        self._stream_buffer = ""
        self._stream_message_ids = {}
        self._last_edit_at = 0.0
        self._last_sent_length = 0
        logger.info("Telegram channel stopped")

    def _run_polling_thread(self) -> None:
        loop = asyncio.new_event_loop()
        self._thread_loop = loop
        asyncio.set_event_loop(loop)
        self._polling_task = loop.create_task(self._poll_updates_loop())
        try:
            loop.run_until_complete(self._polling_task)
        except asyncio.CancelledError:
            pass
        finally:
            pending = asyncio.all_tasks(loop)
            for task in pending:
                task.cancel()
            if pending:
                loop.run_until_complete(
                    asyncio.gather(*pending, return_exceptions=True)
                )
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.close()

    async def _poll_updates_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                result = await self._call_api(
                    "getUpdates",
                    {
                        "offset": self._offset,
                        "timeout": TELEGRAM_LONG_POLL_TIMEOUT_SECONDS,
                    },
                    parse_mode=None,
                )
                if not isinstance(result, list):
                    continue
                for update in result:
                    if not isinstance(update, dict):
                        continue
                    update_id = update.get("update_id")
                    if isinstance(update_id, int):
                        self._offset = update_id + 1
                    await self._process_update(update)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Telegram polling loop failed")
                await asyncio.sleep(1.0)

    async def _process_update(self, update: dict[str, Any]) -> None:
        message = update.get("message")
        if not isinstance(message, dict):
            return

        from_data = message.get("from")
        chat_data = message.get("chat")
        user_id = from_data.get("id") if isinstance(from_data, dict) else None
        chat_id = chat_data.get("id") if isinstance(chat_data, dict) else None
        text = message.get("text")

        if not isinstance(user_id, int) or not isinstance(chat_id, int):
            return

        settings = get_settings()
        if user_id not in settings.telegram.allowed_user_ids:
            await self._send_message(chat_id, UNAUTHORIZED_MESSAGE, markdown=False)
            return

        if chat_id not in settings.telegram.registered_chat_ids:
            settings.telegram.registered_chat_ids.append(chat_id)
            save_settings(settings)
            logger.info("Registered Telegram chat {}", chat_id)

        if not isinstance(text, str) or not text.strip():
            return

        assistant = registry.get_assistant()
        if assistant is None:
            logger.warning("Telegram message dropped: assistant not available")
            return

        assistant.enqueue_message(
            Message(from_id="human", to_id=assistant.uuid, content=text)
        )

    def _on_event(self, event: Event) -> None:
        if event.type not in {
            EventType.ASSISTANT_CONTENT,
            EventType.TOOL_CALLED,
            EventType.NODE_STATE_CHANGED,
        }:
            return

        loop = self._app_loop
        if loop is None or loop.is_closed():
            return

        future = asyncio.run_coroutine_threadsafe(self._process_event(event), loop)
        future.add_done_callback(self._log_event_error)

    @staticmethod
    def _log_event_error(future: Any) -> None:
        try:
            future.result()
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("Telegram event handling failed")

    async def _process_event(self, event: Event) -> None:
        if self._event_lock is None:
            self._event_lock = asyncio.Lock()

        async with self._event_lock:
            assistant = registry.get_assistant()
            if assistant is None or event.agent_id != assistant.uuid:
                return

            if event.type == EventType.ASSISTANT_CONTENT:
                content = event.data.get("content")
                if isinstance(content, str) and content:
                    await self._handle_assistant_content(content)
                return

            if event.type == EventType.TOOL_CALLED:
                tool_name = event.data.get("tool")
                if isinstance(tool_name, str) and tool_name != "idle":
                    await self._broadcast_message(
                        f"🔧 {tool_name}",
                        markdown=False,
                    )
                return

            if (
                event.type == EventType.NODE_STATE_CHANGED
                and event.data.get("new_state") == "idle"
            ):
                await self._finalize_stream()

    async def _handle_assistant_content(self, chunk: str) -> None:
        if not self._stream_message_ids:
            await self._open_stream_messages()

        self._stream_buffer += chunk
        now = time.monotonic()
        if (
            len(self._stream_buffer) - self._last_sent_length
            >= TELEGRAM_EDIT_THRESHOLD_CHARS
            or now - self._last_edit_at >= TELEGRAM_EDIT_INTERVAL_SECONDS
        ):
            await self._flush_stream()

    async def _finalize_stream(self) -> None:
        if not self._stream_buffer and not self._stream_message_ids:
            return
        await self._flush_stream(force=True)
        self._stream_buffer = ""
        self._stream_message_ids = {}
        self._last_edit_at = 0.0
        self._last_sent_length = 0

    async def _open_stream_messages(self) -> None:
        settings = get_settings()
        for chat_id in settings.telegram.registered_chat_ids:
            message_id = await self._send_message(
                chat_id,
                PLACEHOLDER_MESSAGE,
                markdown=False,
            )
            if message_id is not None:
                self._stream_message_ids[chat_id] = message_id
        self._last_edit_at = time.monotonic()
        self._last_sent_length = 0

    async def _flush_stream(self, *, force: bool = False) -> None:
        if not self._stream_message_ids:
            return
        if not self._stream_buffer and not force:
            return

        current_chat_ids = set(get_settings().telegram.registered_chat_ids)
        text = self._format_text(self._stream_buffer or PLACEHOLDER_MESSAGE)
        for chat_id, message_id in list(self._stream_message_ids.items()):
            if chat_id not in current_chat_ids:
                self._stream_message_ids.pop(chat_id, None)
                continue
            updated = await self._edit_message(chat_id, message_id, text)
            if not updated:
                self._stream_message_ids.pop(chat_id, None)

        self._last_edit_at = time.monotonic()
        self._last_sent_length = len(self._stream_buffer)

    async def _broadcast_message(self, text: str, *, markdown: bool) -> None:
        settings = get_settings()
        for chat_id in settings.telegram.registered_chat_ids:
            await self._send_message(chat_id, text, markdown=markdown)

    async def _send_message(
        self,
        chat_id: int,
        text: str,
        *,
        markdown: bool,
    ) -> int | None:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": self._format_text(text),
        }
        result = await self._call_api(
            "sendMessage",
            payload,
            parse_mode="Markdown" if markdown else None,
        )
        if not isinstance(result, dict):
            return None
        message_id = result.get("message_id")
        return message_id if isinstance(message_id, int) else None

    async def _edit_message(
        self,
        chat_id: int,
        message_id: int,
        text: str,
    ) -> bool:
        payload = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": self._format_text(text),
        }
        result = await self._call_api(
            "editMessageText",
            payload,
            parse_mode="Markdown",
        )
        return result is not None

    def _format_text(self, text: str) -> str:
        stripped = text if text else PLACEHOLDER_MESSAGE
        if len(stripped) <= TELEGRAM_MAX_TEXT_LENGTH:
            return stripped
        return stripped[: TELEGRAM_MAX_TEXT_LENGTH - 1] + "…"

    async def _call_api(
        self,
        method: str,
        payload: dict[str, Any],
        *,
        parse_mode: str | None,
    ) -> Any:
        if not self._bot_token:
            return None

        request_payload = {
            key: value for key, value in payload.items() if value is not None
        }
        if parse_mode is not None:
            request_payload["parse_mode"] = parse_mode

        while not self._stop_event.is_set():
            try:
                async with httpx.AsyncClient(
                    timeout=TELEGRAM_REQUEST_TIMEOUT_SECONDS
                ) as client:
                    response = await client.post(
                        f"{TELEGRAM_API_BASE_URL}/bot{self._bot_token}/{method}",
                        data=request_payload,
                    )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Telegram API request failed ({}): {}", method, exc)
                return None

            response_data: dict[str, Any] | None = None
            try:
                response_data = response.json()
            except ValueError:
                response_data = None

            if response.status_code == 429:
                retry_after = self._extract_retry_after(response_data)
                await asyncio.sleep(retry_after)
                continue

            if response.is_success and isinstance(response_data, dict):
                if response_data.get("ok") is True:
                    return response_data.get("result")
                logger.warning(
                    "Telegram API returned error for {}: {}",
                    method,
                    response_data.get("description", "unknown error"),
                )
            elif parse_mode is not None and method in {
                "sendMessage",
                "editMessageText",
            }:
                request_payload.pop("parse_mode", None)
                parse_mode = None
                continue
            else:
                logger.warning(
                    "Telegram API request failed for {} with status {}",
                    method,
                    response.status_code,
                )
            return None

        return None

    @staticmethod
    def _extract_retry_after(response_data: dict[str, Any] | None) -> float:
        if not isinstance(response_data, dict):
            return 1.0
        parameters = response_data.get("parameters")
        if not isinstance(parameters, dict):
            return 1.0
        retry_after = parameters.get("retry_after")
        if isinstance(retry_after, (int, float)) and retry_after > 0:
            return float(retry_after)
        return 1.0
