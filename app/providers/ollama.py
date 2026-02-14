from __future__ import annotations

import json
import time
import uuid
from collections.abc import Callable
from typing import Any

import httpx
from loguru import logger

from app.models import LLMResponse, ModelInfo, ToolCall


class OllamaProvider:
    def __init__(self, api_base_url: str, model: str = "") -> None:
        self._api_base_url = api_base_url.rstrip("/")
        self._model = model
        self._client = httpx.Client(timeout=120.0)

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        on_chunk: Callable[[str, str], None] | None = None,
    ) -> LLMResponse:
        url = f"{self._api_base_url}/api/chat"

        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "stream": True,
        }
        if tools:
            payload["tools"] = tools

        t0 = time.perf_counter()

        content_parts: list[str] = []
        tool_calls_list: list[ToolCall] = []

        with self._client.stream(
            "POST", url, headers={"Content-Type": "application/json"},
            content=json.dumps(payload)
        ) as response:
            if response.status_code != 200:
                body = response.read().decode()
                elapsed = time.perf_counter() - t0
                logger.error(
                    "Ollama API error: {} - {} ({:.2f}s)",
                    response.status_code,
                    body[:200],
                    elapsed,
                )
                raise RuntimeError(
                    f"Ollama API error: {response.status_code} - {body}"
                )

            for line in response.iter_lines():
                if not line:
                    continue

                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue

                message = chunk.get("message", {})
                text = message.get("content", "")
                if text:
                    content_parts.append(text)
                    if on_chunk:
                        on_chunk("content", text)

                for tc in message.get("tool_calls", []):
                    fn = tc.get("function", {})
                    tool_calls_list.append(
                        ToolCall(
                            id=str(uuid.uuid4()),
                            name=fn.get("name", ""),
                            arguments=fn.get("arguments", {}),
                        )
                    )

                if chunk.get("done", False):
                    break

        elapsed = time.perf_counter() - t0
        logger.debug(
            "Ollama stream completed ({:.2f}s, model={})",
            elapsed,
            self._model,
        )

        content = "".join(content_parts) or None

        if tool_calls_list:
            return LLMResponse(content=content, tool_calls=tool_calls_list)

        return LLMResponse(content=content or "")

    def list_models(self) -> list[ModelInfo]:
        url = f"{self._api_base_url}/api/tags"
        try:
            resp = self._client.get(url)
            resp.raise_for_status()
            data = resp.json()
            models = data.get("models", [])
            return [
                ModelInfo(id=m.get("name", ""), name=m.get("name"))
                for m in models
            ]
        except Exception as e:
            logger.error("Failed to list models from {}: {}", url, e)
            return []
