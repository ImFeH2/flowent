from __future__ import annotations

import json
import time
from collections.abc import Callable
from typing import Any

import httpx
from loguru import logger

from app.models import LLMResponse, ModelInfo
from app.models import ToolCallResult as ToolCall
from app.providers import LLMProvider


class OpenAIResponsesProvider(LLMProvider):
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

    def _convert_tools(self, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        for t in tools:
            fn = t.get("function", {})
            result.append(
                {
                    "type": "function",
                    "name": fn.get("name", ""),
                    "description": fn.get("description", ""),
                    "parameters": fn.get("parameters", {}),
                }
            )
        return result

    def _convert_messages(
        self, messages: list[dict[str, Any]]
    ) -> tuple[str | None, list[dict[str, Any]]]:
        system_prompt: str | None = None
        input_items: list[dict[str, Any]] = []

        for msg in messages:
            role = msg.get("role")
            content = msg.get("content")

            if role == "system":
                system_prompt = content
                continue

            if role == "user":
                input_items.append({"role": "user", "content": content})
            elif role == "assistant":
                tool_calls = msg.get("tool_calls")
                if tool_calls:
                    for tc in tool_calls:
                        fn = tc.get("function", {})
                        input_items.append(
                            {
                                "type": "function_call",
                                "call_id": tc.get("id", ""),
                                "name": fn.get("name", ""),
                                "arguments": fn.get("arguments", "{}"),
                            }
                        )
                else:
                    input_items.append({"role": "assistant", "content": content or ""})
            elif role == "tool":
                input_items.append(
                    {
                        "type": "function_call_output",
                        "call_id": msg.get("tool_call_id", ""),
                        "output": content or "",
                    }
                )

        return system_prompt, input_items

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        on_chunk: Callable[[str, str], None] | None = None,
    ) -> LLMResponse:
        url = f"{self._api_base_url}/responses"
        system_prompt, input_items = self._convert_messages(messages)

        payload: dict[str, Any] = {
            "model": self._model,
            "input": input_items,
            "stream": True,
        }
        if system_prompt:
            payload["instructions"] = system_prompt
        if tools:
            payload["tools"] = self._convert_tools(tools)
            payload["tool_choice"] = "auto"

        logger.debug(
            "[{}] OpenAI Responses chat request: model={}, input_items={}, tools={}",
            self._provider_name,
            self._model,
            len(input_items),
            len(tools) if tools else 0,
        )

        t0 = time.perf_counter()
        content_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        chunk_count = 0

        current_tool: dict[str, Any] = {}

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
                    "LLM API error [provider={}, model={}, type=openai_responses]: {} - {} ({:.2f}s)",
                    self._provider_name,
                    self._model,
                    response.status_code,
                    body[:500],
                    elapsed,
                )
                raise RuntimeError(
                    f"LLM API error\n"
                    f"Provider: {self._provider_name}\n"
                    f"Type: openai_responses\n"
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
                    event = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                chunk_count += 1
                event_type = event.get("type", "")

                if event_type == "response.output_text.delta":
                    text = event.get("delta", "")
                    if text:
                        content_parts.append(text)
                        if on_chunk:
                            on_chunk("content", text)

                elif event_type == "response.function_call_arguments.delta":
                    delta = event.get("delta", "")
                    current_tool.setdefault("arguments", "")
                    current_tool["arguments"] += delta

                elif event_type == "response.output_item.added":
                    item = event.get("item", {})
                    if item.get("type") == "function_call":
                        current_tool = {
                            "id": item.get("call_id", ""),
                            "name": item.get("name", ""),
                            "arguments": "",
                        }

                elif event_type == "response.output_item.done":
                    item = event.get("item", {})
                    if item.get("type") == "function_call":
                        call_id = item.get("call_id") or current_tool.get("id", "")
                        name = item.get("name") or current_tool.get("name", "")
                        args_str = item.get("arguments") or current_tool.get(
                            "arguments", "{}"
                        )
                        try:
                            args = json.loads(args_str)
                        except json.JSONDecodeError:
                            args = {}
                        tool_calls.append(
                            ToolCall(id=call_id, name=name, arguments=args)
                        )
                        current_tool = {}

        elapsed = time.perf_counter() - t0
        content = "".join(content_parts) or None

        logger.debug(
            "[{}] OpenAI Responses chat done: {:.2f}s, chunks={}, content_len={}, tool_calls={}",
            self._provider_name,
            elapsed,
            chunk_count,
            len(content) if content else 0,
            len(tool_calls),
        )

        if tool_calls:
            return LLMResponse(content=content, tool_calls=tool_calls, thinking=None)

        return LLMResponse(content=content or "", thinking=None)

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
                "Failed to list models [provider={}, type=openai_responses]: {}",
                self._provider_name,
                e,
            )
            return []
