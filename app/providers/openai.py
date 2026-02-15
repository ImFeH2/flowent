from __future__ import annotations

import json
import time
from collections.abc import Callable
from typing import Any

import httpx
from loguru import logger

from app.models import LLMResponse, ModelInfo, ToolCall
from app.providers import LLMProvider
from app.providers.thinking import ThinkTagParser


def _extract_delta_parts(delta: dict[str, Any]) -> tuple[str | None, str | None]:
    content_text: str | None = None
    thinking_text: str | None = None

    reasoning = delta.get("reasoning_content") or delta.get("reasoning")
    if reasoning:
        thinking_text = reasoning

    raw_content = delta.get("content")
    if raw_content is None:
        pass
    elif isinstance(raw_content, str):
        if raw_content:
            content_text = raw_content
    elif isinstance(raw_content, list):
        for part in raw_content:
            if not isinstance(part, dict):
                continue
            part_type = part.get("type", "")
            text = part.get("text", "")
            if not text:
                continue
            if part_type in ("reasoning", "thinking"):
                thinking_text = (thinking_text or "") + text
            else:
                content_text = (content_text or "") + text

    return content_text, thinking_text


class OpenAIProvider(LLMProvider):
    def __init__(
        self,
        provider_name: str,
        api_base_url: str,
        api_key: str = "",
        model: str = "",
    ) -> None:
        self._provider_name = provider_name
        self._api_base_url = api_base_url.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._client = httpx.Client(timeout=120.0)

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        on_chunk: Callable[[str, str], None] | None = None,
    ) -> LLMResponse:
        url = f"{self._api_base_url}/chat/completions"
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "stream": True,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        logger.debug(
            "[{}] OpenAI chat request: model={}, messages={}, tools={}",
            self._provider_name,
            self._model,
            len(messages),
            len(tools) if tools else 0,
        )

        t0 = time.perf_counter()

        content_parts: list[str] = []
        thinking_parts: list[str] = []
        tool_calls_accum: dict[int, dict[str, Any]] = {}
        chunk_count = 0
        think_parser = ThinkTagParser()

        with self._client.stream(
            "POST",
            url,
            headers=self._headers(),
            content=json.dumps(payload),
        ) as response:
            if response.status_code != 200:
                body = response.read().decode()
                elapsed = time.perf_counter() - t0
                logger.error(
                    "LLM API error [provider={}, model={}, type=openai]: {} - {} ({:.2f}s)",
                    self._provider_name,
                    self._model,
                    response.status_code,
                    body[:500],
                    elapsed,
                )
                raise RuntimeError(
                    f"LLM API error\n"
                    f"Provider: {self._provider_name}\n"
                    f"Type: openai\n"
                    f"Model: {self._model}\n"
                    f"Base URL: {self._api_base_url}\n"
                    f"Status: {response.status_code}\n"
                    f"Response: {body}",
                )

            for line in response.iter_lines():
                if not line or line.startswith(":"):
                    continue
                if not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str.strip() == "[DONE]":
                    break

                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                chunk_count += 1
                choices = chunk.get("choices")
                if not choices:
                    continue
                delta = choices[0].get("delta", {})

                content_text, thinking_text = _extract_delta_parts(delta)

                if thinking_text:
                    thinking_parts.append(thinking_text)
                    if on_chunk:
                        on_chunk("thinking", thinking_text)

                if content_text:
                    for chunk_type, text in think_parser.feed(content_text):
                        if chunk_type == "thinking":
                            thinking_parts.append(text)
                            if on_chunk:
                                on_chunk("thinking", text)
                        else:
                            content_parts.append(text)
                            if on_chunk:
                                on_chunk("content", text)

                if delta.get("tool_calls"):
                    for tc_delta in delta["tool_calls"]:
                        idx = tc_delta["index"]
                        if idx not in tool_calls_accum:
                            tool_calls_accum[idx] = {
                                "id": "",
                                "name": "",
                                "arguments": "",
                            }
                        acc = tool_calls_accum[idx]
                        if tc_delta.get("id"):
                            acc["id"] = tc_delta["id"]
                        fn = tc_delta.get("function", {})
                        if fn.get("name"):
                            acc["name"] = fn["name"]
                        if fn.get("arguments"):
                            acc["arguments"] += fn["arguments"]

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
            "[{}] OpenAI chat done: {:.2f}s, chunks={}, content_len={}, thinking_len={}, tool_calls={}",
            self._provider_name,
            elapsed,
            chunk_count,
            len(content) if content else 0,
            len(thinking) if thinking else 0,
            len(tool_calls_accum),
        )

        if tool_calls_accum:
            tool_calls = [
                ToolCall(
                    id=acc["id"],
                    name=acc["name"],
                    arguments=json.loads(acc["arguments"]),
                )
                for _, acc in sorted(tool_calls_accum.items())
            ]
            return LLMResponse(
                content=content,
                tool_calls=tool_calls,
                thinking=thinking,
            )

        return LLMResponse(content=content or "", thinking=thinking)

    def list_models(self) -> list[ModelInfo]:
        url = f"{self._api_base_url}/models"
        try:
            resp = self._client.get(url, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
            models = data.get("data", [])
            return [ModelInfo(id=m["id"]) for m in models]
        except Exception as e:
            logger.error(
                "Failed to list models [provider={}, type=openai]: {}",
                self._provider_name,
                e,
            )
            return []
