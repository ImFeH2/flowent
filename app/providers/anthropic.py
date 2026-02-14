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


class AnthropicProvider(LLMProvider):
    def __init__(self, api_base_url: str, api_key: str = "", model: str = "") -> None:
        self._api_base_url = api_base_url.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._client = httpx.Client(timeout=5.0)

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "x-api-key": self._api_key,
            "anthropic-version": "2023-06-01",
        }

    def _convert_messages(
        self, messages: list[dict[str, Any]]
    ) -> tuple[str | None, list[dict[str, Any]]]:
        system_text: list[str] = []
        converted: list[dict[str, Any]] = []

        for msg in messages:
            if msg["role"] == "system":
                system_text.append(msg["content"])
            else:
                converted.append({"role": msg["role"], "content": msg["content"]})

        system = "\n\n".join(system_text) if system_text else None
        return system, converted

    def _convert_tools(self, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        for tool in tools:
            fn = tool.get("function", {})
            result.append(
                {
                    "name": fn.get("name", ""),
                    "description": fn.get("description", ""),
                    "input_schema": fn.get("parameters", {}),
                }
            )
        return result

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        on_chunk: Callable[[str, str], None] | None = None,
    ) -> LLMResponse:
        url = f"{self._api_base_url}/v1/messages"
        system, converted_messages = self._convert_messages(messages)

        payload: dict[str, Any] = {
            "model": self._model,
            "messages": converted_messages,
            "max_tokens": 8192,
            "stream": True,
        }
        if system:
            payload["system"] = system
        if tools:
            payload["tools"] = self._convert_tools(tools)

        t0 = time.perf_counter()

        content_parts: list[str] = []
        thinking_parts: list[str] = []
        tool_calls_accum: dict[int, dict[str, Any]] = {}
        current_block_idx = -1

        with self._client.stream(
            "POST", url, headers=self._headers(), content=json.dumps(payload)
        ) as response:
            if response.status_code != 200:
                body = response.read().decode()
                elapsed = time.perf_counter() - t0
                logger.error(
                    "Anthropic API error: {} - {} ({:.2f}s)",
                    response.status_code,
                    body[:200],
                    elapsed,
                )
                raise RuntimeError(
                    f"Anthropic API error: {response.status_code} - {body}"
                )

            for line in response.iter_lines():
                if not line or line.startswith(":"):
                    continue
                if not line.startswith("data: "):
                    continue
                data_str = line[6:]

                try:
                    event = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                event_type = event.get("type", "")

                if event_type == "content_block_start":
                    current_block_idx += 1
                    block = event.get("content_block", {})
                    if block.get("type") == "tool_use":
                        tool_calls_accum[current_block_idx] = {
                            "id": block.get("id", str(uuid.uuid4())),
                            "name": block.get("name", ""),
                            "arguments": "",
                        }

                elif event_type == "content_block_delta":
                    delta = event.get("delta", {})
                    delta_type = delta.get("type", "")

                    if delta_type == "text_delta":
                        text = delta.get("text", "")
                        if text:
                            content_parts.append(text)
                            if on_chunk:
                                on_chunk("content", text)

                    elif delta_type == "thinking_delta":
                        thinking = delta.get("thinking", "")
                        if thinking:
                            thinking_parts.append(thinking)
                            if on_chunk:
                                on_chunk("thinking", thinking)

                    elif delta_type == "input_json_delta":
                        partial = delta.get("partial_json", "")
                        if current_block_idx in tool_calls_accum:
                            tool_calls_accum[current_block_idx]["arguments"] += partial

                elif event_type == "message_stop":
                    break

        elapsed = time.perf_counter() - t0
        logger.debug(
            "Anthropic stream completed ({:.2f}s, model={})",
            elapsed,
            self._model,
        )

        content = "".join(content_parts) or None
        thinking = "".join(thinking_parts) or None

        if tool_calls_accum:
            tool_calls = []
            for _, acc in sorted(tool_calls_accum.items()):
                args_str = acc["arguments"]
                try:
                    arguments = json.loads(args_str) if args_str else {}
                except json.JSONDecodeError:
                    arguments = {}
                tool_calls.append(
                    ToolCall(id=acc["id"], name=acc["name"], arguments=arguments)
                )
            return LLMResponse(
                content=content, tool_calls=tool_calls, thinking=thinking
            )

        return LLMResponse(content=content or "", thinking=thinking)

    def list_models(self) -> list[ModelInfo]:
        url = f"{self._api_base_url}/v1/models"
        try:
            resp = self._client.get(url, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
            models = data.get("data", [])
            return [ModelInfo(id=m["id"]) for m in models]
        except Exception as e:
            logger.error("Failed to list models from {}: {}", url, e)
            return []
