from __future__ import annotations

import asyncio
import json
from dataclasses import asdict

from loguru import logger
from starlette.websockets import WebSocket

from app.models import DISPLAY_EVENTS, Event


class EventBus:
    def __init__(self) -> None:
        self._display_connections: list[WebSocket] = []
        self._update_connections: list[WebSocket] = []
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect_display(self, ws: WebSocket) -> None:
        await ws.accept()
        self._display_connections.append(ws)
        logger.info("Display WS connected (total: {})", len(self._display_connections))

    async def connect_updates(self, ws: WebSocket) -> None:
        await ws.accept()
        self._update_connections.append(ws)
        logger.info("Update WS connected (total: {})", len(self._update_connections))

    def disconnect_display(self, ws: WebSocket) -> None:
        if ws in self._display_connections:
            self._display_connections.remove(ws)
            logger.info(
                "Display WS disconnected (total: {})",
                len(self._display_connections),
            )

    def disconnect_updates(self, ws: WebSocket) -> None:
        if ws in self._update_connections:
            self._update_connections.remove(ws)
            logger.info(
                "Update WS disconnected (total: {})",
                len(self._update_connections),
            )

    async def _broadcast(self, event: Event) -> None:
        payload = json.dumps(asdict(event), default=str)

        dead: list[WebSocket] = []
        for ws in self._update_connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_updates(ws)

        if event.type in DISPLAY_EVENTS:
            dead = []
            for ws in self._display_connections:
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.disconnect_display(ws)

    def emit(self, event: Event) -> None:
        if self._loop is None:
            logger.warning("EventBus loop not set, dropping event: {}", event.type)
            return
        asyncio.run_coroutine_threadsafe(self._broadcast(event), self._loop)


event_bus = EventBus()
