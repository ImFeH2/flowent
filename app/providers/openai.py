from __future__ import annotations

import json
import time
from collections.abc import Callable
from typing import Any

import httpx
from loguru import logger

from app.models import LLMResponse, ModelInfo, ToolCall
from app.providers import LLMProvider


class OpenAIProvider(LLMProvider):
    def __init__(self, api_base_url: str, api_key: str = "", model: str = "") -> None:
        self._api_base_url = api_base_url.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._client = httpx.Client(timeout=5.0)

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

        t0 = time.perf_counter()

        content_parts: list[str] = []
        thinking_parts: list[str] = []
        tool_calls_accum: dict[int, dict[str, Any]] = {}

        with self._client.stream(
            "POST", url, headers=self._headers(), content=json.dumps(payload)
        ) as response:
            if response.status_code != 200:
                body = response.read().decode()
                elapsed = time.perf_counter() - t0
                logger.error(
                    "OpenAI API error: {} - {} ({:.2f}s)",
                    response.status_code,
                    body[:200],
                    elapsed,
                )
                raise RuntimeError(f"OpenAI API error: {response.status_code} - {body}")

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

                choices = chunk.get("choices")
                if not choices:
                    continue
                delta = choices[0].get("delta", {})

                if delta.get("content"):
                    text = delta["content"]
                    content_parts.append(text)
                    if on_chunk:
                        on_chunk("content", text)

                reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                if reasoning:
                    thinking_parts.append(reasoning)
                    if on_chunk:
                        on_chunk("thinking", reasoning)

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

        elapsed = time.perf_counter() - t0
        logger.debug(
            "OpenAI stream completed ({:.2f}s, model={})",
            elapsed,
            self._model,
        )

        content = "".join(content_parts) or None
        thinking = "".join(thinking_parts) or None

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
                content=content, tool_calls=tool_calls, thinking=thinking
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
            logger.error("Failed to list models from {}: {}", url, e)
            return []
