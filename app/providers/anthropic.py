from __future__ import annotations

import json
import time
import uuid
from collections.abc import Callable
from typing import Any

import httpx
from loguru import logger

from app.models import LLMResponse, ModelInfo
from app.models import ToolCallResult as ToolCall
from app.providers import LLMProvider
from app.providers.errors import build_network_error, build_status_error
from app.providers.sse import iter_sse_json
from app.settings import ModelParams


class AnthropicProvider(LLMProvider):
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
        return {
            "Content-Type": "application/json",
            "x-api-key": self._api_key,
            "anthropic-version": "2023-06-01",
        }

    def _convert_messages(
        self,
        messages: list[dict[str, Any]],
    ) -> tuple[str | None, list[dict[str, Any]]]:
        system_text: list[str] = []
        converted: list[dict[str, Any]] = []
        pending_tool_results: list[dict[str, Any]] = []

        def flush_tool_results() -> None:
            if not pending_tool_results:
                return
            converted.append(
                {
                    "role": "user",
                    "content": list(pending_tool_results),
                }
            )
            pending_tool_results.clear()

        for msg in messages:
            role = msg.get("role")

            if role == "system":
                content = msg.get("content")
                if content is not None:
                    system_text.append(
                        content if isinstance(content, str) else json.dumps(content),
                    )
                continue

            if role == "tool":
                content = msg.get("content")
                if content is None:
                    tool_content = ""
                elif isinstance(content, str):
                    tool_content = content
                else:
                    tool_content = json.dumps(content)

                pending_tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": msg.get("tool_call_id", ""),
                        "content": tool_content,
                    }
                )
                continue

            flush_tool_results()

            if role == "assistant" and msg.get("tool_calls"):
                content_blocks: list[dict[str, Any]] = []
                content = msg.get("content")
                if isinstance(content, str) and content:
                    content_blocks.append({"type": "text", "text": content})

                for tool_call in msg.get("tool_calls", []):
                    fn = tool_call.get("function", {})
                    raw_arguments = fn.get("arguments", "{}")

                    if isinstance(raw_arguments, str):
                        try:
                            parsed_arguments = (
                                json.loads(raw_arguments) if raw_arguments else {}
                            )
                        except json.JSONDecodeError:
                            parsed_arguments = {}
                    elif isinstance(raw_arguments, dict):
                        parsed_arguments = raw_arguments
                    else:
                        parsed_arguments = {}

                    if not isinstance(parsed_arguments, dict):
                        parsed_arguments = {}

                    content_blocks.append(
                        {
                            "type": "tool_use",
                            "id": tool_call.get("id", ""),
                            "name": fn.get("name", ""),
                            "input": parsed_arguments,
                        }
                    )

                converted.append({"role": "assistant", "content": content_blocks})
                continue

            converted.append({"role": role, "content": msg.get("content")})

        flush_tool_results()

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
                },
            )
        return result

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        on_chunk: Callable[[str, str], None] | None = None,
        register_interrupt: Callable[[Callable[[], None] | None], None] | None = None,
        model_params: ModelParams | None = None,
    ) -> LLMResponse:
        url = f"{self._api_base_url}/v1/messages"
        system, converted_messages = self._convert_messages(messages)

        payload: dict[str, Any] = {
            "model": self._model,
            "messages": converted_messages,
            "max_tokens": (
                model_params.max_output_tokens
                if model_params is not None
                and model_params.max_output_tokens is not None
                else 8192
            ),
            "stream": True,
        }
        if model_params is not None:
            if model_params.temperature is not None:
                payload["temperature"] = model_params.temperature
            if model_params.top_p is not None:
                payload["top_p"] = model_params.top_p
        if system:
            payload["system"] = system
        if tools:
            payload["tools"] = self._convert_tools(tools)

        logger.debug(
            "[{}] Anthropic chat request: model={}, messages={}, tools={}",
            self._provider_name,
            self._model,
            len(converted_messages),
            len(tools) if tools else 0,
        )

        t0 = time.perf_counter()

        content_parts: list[str] = []
        thinking_parts: list[str] = []
        tool_calls_accum: dict[int, dict[str, Any]] = {}
        current_block_idx = -1
        event_count = 0
        client = self._client
        if register_interrupt is not None:
            register_interrupt(client.close)

        try:
            with client.stream(
                "POST",
                url,
                headers=self._headers(),
                content=json.dumps(payload),
            ) as response:
                if register_interrupt is not None:
                    register_interrupt(response.close)
                if response.status_code != 200:
                    body = response.read().decode()
                    elapsed = time.perf_counter() - t0
                    logger.error(
                        "LLM API error [provider={}, model={}, type=anthropic]: {} - {} ({:.2f}s)",
                        self._provider_name,
                        self._model,
                        response.status_code,
                        body[:500],
                        elapsed,
                    )
                    raise build_status_error(
                        provider_name=self._provider_name,
                        provider_type="anthropic",
                        model=self._model,
                        base_url=self._api_base_url,
                        status_code=response.status_code,
                        body=body,
                    )

                for event in iter_sse_json(response):
                    event_count += 1
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
                                tool_calls_accum[current_block_idx]["arguments"] += (
                                    partial
                                )

                    elif event_type == "message_stop":
                        break
        except httpx.TransportError as exc:
            elapsed = time.perf_counter() - t0
            logger.warning(
                "LLM API transport error [provider={}, model={}, type=anthropic]: {} ({:.2f}s)",
                self._provider_name,
                self._model,
                exc,
                elapsed,
            )
            raise build_network_error(
                provider_name=self._provider_name,
                provider_type="anthropic",
                model=self._model,
                base_url=self._api_base_url,
                error=exc,
            ) from exc
        finally:
            if getattr(client, "is_closed", False):
                self._client = httpx.Client(timeout=120.0)

        elapsed = time.perf_counter() - t0
        content = "".join(content_parts) or None
        thinking = "".join(thinking_parts) or None

        logger.debug(
            "[{}] Anthropic chat done: {:.2f}s, events={}, content_len={}, thinking_len={}, tool_calls={}",
            self._provider_name,
            elapsed,
            event_count,
            len(content) if content else 0,
            len(thinking) if thinking else 0,
            len(tool_calls_accum),
        )

        if tool_calls_accum:
            tool_calls = []
            for _, acc in sorted(tool_calls_accum.items()):
                args_str = acc["arguments"]
                try:
                    arguments = json.loads(args_str) if args_str else {}
                except json.JSONDecodeError:
                    arguments = {}
                tool_calls.append(
                    ToolCall(id=acc["id"], name=acc["name"], arguments=arguments),
                )
            return LLMResponse(
                content=content,
                tool_calls=tool_calls,
                thinking=thinking,
            )

        return LLMResponse(content=content or "", thinking=thinking)

    def list_models(
        self,
        register_interrupt: Callable[[Callable[[], None] | None], None] | None = None,
    ) -> list[ModelInfo]:
        url = f"{self._api_base_url}/v1/models"
        client = self._client
        if register_interrupt is not None:
            register_interrupt(client.close)
        try:
            resp = client.get(url, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
            models = data.get("data", [])
            return [ModelInfo(id=m["id"]) for m in models]
        except Exception as e:
            logger.error(
                "Failed to list models [provider={}, type=anthropic]: {}",
                self._provider_name,
                e,
            )
            return []
        finally:
            if getattr(client, "is_closed", False):
                self._client = httpx.Client(timeout=120.0)
