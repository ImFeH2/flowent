from __future__ import annotations

import json
import time
import uuid
from collections.abc import Callable
from typing import Any

import httpx
from loguru import logger

from app.models import LLMResponse, ModelInfo, ToolCall
from app.providers import LLMProvider
from app.providers.thinking import ThinkTagParser


class OllamaProvider(LLMProvider):
    def __init__(
        self,
        provider_name: str,
        api_base_url: str,
        model: str = "",
    ) -> None:
        self._provider_name = provider_name
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

        logger.debug(
            "[{}] Ollama chat request: model={}, messages={}, tools={}",
            self._provider_name,
            self._model,
            len(messages),
            len(tools) if tools else 0,
        )

        t0 = time.perf_counter()

        content_parts: list[str] = []
        thinking_parts: list[str] = []
        tool_calls_list: list[ToolCall] = []
        chunk_count = 0
        think_parser = ThinkTagParser()

        with self._client.stream(
            "POST",
            url,
            headers={"Content-Type": "application/json"},
            content=json.dumps(payload),
        ) as response:
            if response.status_code != 200:
                body = response.read().decode()
                elapsed = time.perf_counter() - t0
                logger.error(
                    "LLM API error [provider={}, model={}, type=ollama]: {} - {} ({:.2f}s)",
                    self._provider_name,
                    self._model,
                    response.status_code,
                    body[:500],
                    elapsed,
                )
                raise RuntimeError(
                    f"LLM API error\n"
                    f"Provider: {self._provider_name}\n"
                    f"Type: ollama\n"
                    f"Model: {self._model}\n"
                    f"Base URL: {self._api_base_url}\n"
                    f"Status: {response.status_code}\n"
                    f"Response: {body}",
                )

            for line in response.iter_lines():
                if not line:
                    continue

                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue

                chunk_count += 1
                message = chunk.get("message", {})
                text = message.get("content", "")
                if text:
                    for chunk_type, parsed in think_parser.feed(text):
                        if chunk_type == "thinking":
                            thinking_parts.append(parsed)
                            if on_chunk:
                                on_chunk("thinking", parsed)
                        else:
                            content_parts.append(parsed)
                            if on_chunk:
                                on_chunk("content", parsed)

                for tc in message.get("tool_calls", []):
                    fn = tc.get("function", {})
                    tool_calls_list.append(
                        ToolCall(
                            id=str(uuid.uuid4()),
                            name=fn.get("name", ""),
                            arguments=fn.get("arguments", {}),
                        ),
                    )

                if chunk.get("done", False):
                    break

        for chunk_type, text in think_parser.flush():
            if chunk_type == "thinking":
                thinking_parts.append(text)
                if on_chunk:
                    on_chunk("thinking", text)
            else:
                content_parts.append(text)
                if on_chunk:
                    on_chunk("content", text)

        elapsed = time.perf_counter() - t0
        content = "".join(content_parts) or None
        thinking = "".join(thinking_parts) or None

        logger.debug(
            "[{}] Ollama chat done: {:.2f}s, chunks={}, content_len={}, thinking_len={}, tool_calls={}",
            self._provider_name,
            elapsed,
            chunk_count,
            len(content) if content else 0,
            len(thinking) if thinking else 0,
            len(tool_calls_list),
        )

        if tool_calls_list:
            return LLMResponse(
                content=content,
                tool_calls=tool_calls_list,
                thinking=thinking,
            )

        return LLMResponse(content=content or "", thinking=thinking)

    def list_models(self) -> list[ModelInfo]:
        url = f"{self._api_base_url}/api/tags"
        try:
            resp = self._client.get(url)
            resp.raise_for_status()
            data = resp.json()
            models = data.get("models", [])
            return [ModelInfo(id=m.get("name", "")) for m in models]
        except Exception as e:
            logger.error(
                "Failed to list models [provider={}, type=ollama]: {}",
                self._provider_name,
                e,
            )
            return []
