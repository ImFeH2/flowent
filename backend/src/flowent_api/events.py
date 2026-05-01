from __future__ import annotations

import asyncio
import json
import threading
from collections.abc import Callable

from loguru import logger
from starlette.websockets import WebSocket

from flowent_api.models import DISPLAY_EVENTS, Event

type DisconnectFn = Callable[[WebSocket], None]


class EventBus:
    def __init__(self) -> None:
        self._display_connections: set[WebSocket] = set()
        self._update_connections: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._subscribers: set[Callable[[Event], None]] = set()
        self._subscribers_lock = threading.Lock()

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def get_loop(self) -> asyncio.AbstractEventLoop | None:
        return self._loop

    def subscribe(self, callback: Callable[[Event], None]) -> None:
        with self._subscribers_lock:
            self._subscribers.add(callback)

    def unsubscribe(self, callback: Callable[[Event], None]) -> None:
        with self._subscribers_lock:
            self._subscribers.discard(callback)

    async def connect_display(self, ws: WebSocket) -> None:
        await self._connect(ws, self._display_connections, "Display")

    async def connect_updates(self, ws: WebSocket) -> None:
        await self._connect(ws, self._update_connections, "Update")

    def disconnect_display(self, ws: WebSocket) -> None:
        self._disconnect(ws, self._display_connections, "Display")

    def disconnect_updates(self, ws: WebSocket) -> None:
        self._disconnect(ws, self._update_connections, "Update")

    async def close_all(
        self, *, code: int = 1008, reason: str = "Access revoked"
    ) -> None:
        display_connections = tuple(self._display_connections)
        update_connections = tuple(self._update_connections)

        for ws in display_connections:
            try:
                await ws.close(code=code, reason=reason)
            finally:
                self.disconnect_display(ws)

        for ws in update_connections:
            try:
                await ws.close(code=code, reason=reason)
            finally:
                self.disconnect_updates(ws)

    def close_all_connections(
        self,
        *,
        code: int = 1008,
        reason: str = "Access revoked",
    ) -> None:
        if self._loop is None or self._loop.is_closed():
            return
        asyncio.run_coroutine_threadsafe(
            self.close_all(code=code, reason=reason),
            self._loop,
        )

    async def _connect(
        self,
        ws: WebSocket,
        connections: set[WebSocket],
        channel_name: str,
    ) -> None:
        await ws.accept()
        connections.add(ws)
        logger.info("{} WS connected (total: {})", channel_name, len(connections))

    def _disconnect(
        self,
        ws: WebSocket,
        connections: set[WebSocket],
        channel_name: str,
    ) -> None:
        if ws not in connections:
            return
        connections.remove(ws)
        logger.info("{} WS disconnected (total: {})", channel_name, len(connections))

    async def _broadcast_to(
        self,
        connections: set[WebSocket],
        payload: str,
        disconnect: DisconnectFn,
    ) -> None:
        dead: list[WebSocket] = []
        for ws in tuple(connections):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            disconnect(ws)

    async def _broadcast(self, event: Event) -> None:
        payload = json.dumps(
            {
                "type": event.type.value,
                "agent_id": event.agent_id,
                "data": event.data,
                "timestamp": event.timestamp,
            },
            default=str,
        )

        await self._broadcast_to(
            self._update_connections,
            payload,
            self.disconnect_updates,
        )

        if event.type in DISPLAY_EVENTS:
            await self._broadcast_to(
                self._display_connections,
                payload,
                self.disconnect_display,
            )

    def emit(self, event: Event) -> None:
        with self._subscribers_lock:
            subscribers = tuple(self._subscribers)

        for subscriber in subscribers:
            try:
                subscriber(event)
            except Exception:
                logger.exception("EventBus subscriber failed for {}", event.type)

        if self._loop is None or self._loop.is_closed():
            logger.warning("EventBus loop not set, dropping event: {}", event.type)
            return
        asyncio.run_coroutine_threadsafe(self._broadcast(event), self._loop)


event_bus = EventBus()
