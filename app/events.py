from __future__ import annotations

import asyncio
import json
from collections.abc import Callable

from loguru import logger
from starlette.websockets import WebSocket

from app.models import DISPLAY_EVENTS, Event

type DisconnectFn = Callable[[WebSocket], None]


class EventBus:
    def __init__(self) -> None:
        self._display_connections: set[WebSocket] = set()
        self._update_connections: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect_display(self, ws: WebSocket) -> None:
        await self._connect(ws, self._display_connections, "Display")

    async def connect_updates(self, ws: WebSocket) -> None:
        await self._connect(ws, self._update_connections, "Update")

    def disconnect_display(self, ws: WebSocket) -> None:
        self._disconnect(ws, self._display_connections, "Display")

    def disconnect_updates(self, ws: WebSocket) -> None:
        self._disconnect(ws, self._update_connections, "Update")

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
        if self._loop is None or self._loop.is_closed():
            logger.warning("EventBus loop not set, dropping event: {}", event.type)
            return
        asyncio.run_coroutine_threadsafe(self._broadcast(event), self._loop)


event_bus = EventBus()
