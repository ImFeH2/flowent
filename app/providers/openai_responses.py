from __future__ import annotations

import json
import time
from collections.abc import Callable
from typing import Any

from loguru import logger

from app.models import LLMResponse, ModelInfo
from app.models import ToolCallResult as ToolCall
from app.network import (
    RequestException,
    create_http_session,
    iter_response_lines,
    read_response_text,
    response_looks_like_html,
    truncate_text,
)
from app.providers import LLMProvider
from app.providers.errors import (
    build_access_blocked_error,
    build_network_error,
    build_status_error,
)
from app.providers.headers import merge_headers
from app.settings import ModelParams

REASONING_MODEL_PREFIXES = ("gpt-5", "o1", "o3", "o4")
VERBOSITY_MODEL_PREFIXES = ("gpt-5",)
REASONING_DELTA_EVENT_TYPES = {
    "response.reasoning.delta",
    "response.reasoning_text.delta",
    "response.reasoning_summary_text.delta",
}


def _supports_reasoning(model: str) -> bool:
    return model.startswith(REASONING_MODEL_PREFIXES)


def _build_reasoning_config(
    model: str,
    model_params: ModelParams | None,
) -> dict[str, str] | None:
    if not _supports_reasoning(model) or model_params is None:
        return None
    effort = model_params.reasoning_effort
    if effort is None or effort == "none":
        return None

    return {
        "effort": effort,
        "summary": "detailed",
    }


def _build_text_config(
    model: str,
    model_params: ModelParams | None,
) -> dict[str, object] | None:
    if model_params is None or not model.startswith(VERBOSITY_MODEL_PREFIXES):
        return None
    if not model_params.verbosity:
        return None

    return {
        "format": {"type": "text"},
        "verbosity": model_params.verbosity,
    }


def _extract_reasoning_text_from_item(item: dict[str, Any]) -> str | None:
    parts: list[str] = []

    for key in ("summary", "content"):
        raw_value = item.get(key)

        if isinstance(raw_value, str):
            if raw_value.strip():
                parts.append(raw_value)
            continue

        if not isinstance(raw_value, list):
            continue

        for entry in raw_value:
            if not isinstance(entry, dict):
                continue
            text = entry.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text)

    if not parts:
        return None

    return "".join(parts)


def _extract_reasoning_text_from_output(output: Any) -> str | None:
    if not isinstance(output, list):
        return None

    parts: list[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        if item.get("type") != "reasoning":
            continue
        text = _extract_reasoning_text_from_item(item)
        if text:
            parts.append(text)

    if not parts:
        return None

    return "\n\n".join(parts)


def _extract_reasoning_tokens(response: dict[str, Any]) -> int:
    usage = response.get("usage")
    if not isinstance(usage, dict):
        return 0

    output_tokens_details = usage.get("output_tokens_details")
    if not isinstance(output_tokens_details, dict):
        return 0

    tokens = output_tokens_details.get("reasoning_tokens")
    return tokens if isinstance(tokens, int) and tokens > 0 else 0


def _format_reasoning_fallback(reasoning_tokens: int) -> str:
    if reasoning_tokens > 0:
        return f"Internal reasoning · {reasoning_tokens}"

    return "Internal reasoning"


class OpenAIResponsesProvider(LLMProvider):
    def __init__(
        self,
        provider_name: str,
        api_base_url: str,
        api_key: str = "",
        headers: dict[str, str] | None = None,
        model: str = "",
    ) -> None:
        self._provider_name = provider_name
        self._api_base_url = api_base_url.rstrip("/")
        self._api_key = api_key
        self._header_overrides = dict(headers or {})
        self._model = model
        self._client = create_http_session(timeout=120.0)

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return merge_headers(headers, self._header_overrides)

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
        register_interrupt: Callable[[Callable[[], None] | None], None] | None = None,
        model_params: ModelParams | None = None,
    ) -> LLMResponse:
        url = f"{self._api_base_url}/responses"
        system_prompt, input_items = self._convert_messages(messages)

        payload: dict[str, Any] = {
            "model": self._model,
            "input": input_items,
            "stream": True,
        }
        reasoning = _build_reasoning_config(self._model, model_params)
        if reasoning:
            payload["reasoning"] = reasoning
        text_config = _build_text_config(self._model, model_params)
        if text_config:
            payload["text"] = text_config
        if model_params is not None:
            if model_params.max_output_tokens is not None:
                payload["max_output_tokens"] = model_params.max_output_tokens
            if reasoning is None:
                if model_params.temperature is not None:
                    payload["temperature"] = model_params.temperature
                if model_params.top_p is not None:
                    payload["top_p"] = model_params.top_p
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
        thinking_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        chunk_count = 0
        saw_reasoning_item = False
        saw_reasoning_text = False
        reasoning_tokens = 0

        current_tool: dict[str, Any] = {}
        client = self._client
        if register_interrupt is not None:
            register_interrupt(client.close)

        try:
            with client.stream(
                "POST",
                url,
                headers=self._headers(),
                json=payload,
            ) as response:
                if register_interrupt is not None:
                    register_interrupt(response.close)
                if response_looks_like_html(response):
                    raise build_access_blocked_error(
                        provider_name=self._provider_name,
                        provider_type="openai_responses",
                        model=self._model,
                        base_url=self._api_base_url,
                        status_code=response.status_code,
                        detail=truncate_text(read_response_text(response)),
                    )
                if response.status_code != 200:
                    body = truncate_text(read_response_text(response))
                    elapsed = time.perf_counter() - t0
                    logger.error(
                        "LLM API error [provider={}, model={}, type=openai_responses]: {} - {} ({:.2f}s)",
                        self._provider_name,
                        self._model,
                        response.status_code,
                        body[:500],
                        elapsed,
                    )
                    raise build_status_error(
                        provider_name=self._provider_name,
                        provider_type="openai_responses",
                        model=self._model,
                        base_url=self._api_base_url,
                        status_code=response.status_code,
                        body=body,
                    )

                for line in iter_response_lines(response):
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

                    if event_type in REASONING_DELTA_EVENT_TYPES:
                        text = event.get("delta", "")
                        if text:
                            saw_reasoning_text = True
                            thinking_parts.append(text)
                            if on_chunk:
                                on_chunk("thinking", text)

                    elif event_type == "response.output_text.delta":
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
                        if item.get("type") == "reasoning":
                            saw_reasoning_item = True
                        elif item.get("type") == "function_call":
                            current_tool = {
                                "id": item.get("call_id", ""),
                                "name": item.get("name", ""),
                                "arguments": "",
                            }

                    elif event_type == "response.output_item.done":
                        item = event.get("item", {})
                        if item.get("type") == "reasoning":
                            saw_reasoning_item = True
                            if not saw_reasoning_text:
                                reasoning_text = _extract_reasoning_text_from_item(item)
                                if reasoning_text:
                                    saw_reasoning_text = True
                                    thinking_parts.append(reasoning_text)
                                    if on_chunk:
                                        on_chunk("thinking", reasoning_text)
                        elif item.get("type") == "function_call":
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

                    elif event_type == "response.completed":
                        response_data = event.get("response", {})
                        if isinstance(response_data, dict):
                            reasoning_tokens = _extract_reasoning_tokens(response_data)
                            if not saw_reasoning_text:
                                reasoning_text = _extract_reasoning_text_from_output(
                                    response_data.get("output")
                                )
                                if reasoning_text:
                                    saw_reasoning_text = True
                                    thinking_parts.append(reasoning_text)
                                    if on_chunk:
                                        on_chunk("thinking", reasoning_text)
        except RequestException as exc:
            elapsed = time.perf_counter() - t0
            logger.warning(
                "LLM API transport error [provider={}, model={}, type=openai_responses]: {} ({:.2f}s)",
                self._provider_name,
                self._model,
                exc,
                elapsed,
            )
            raise build_network_error(
                provider_name=self._provider_name,
                provider_type="openai_responses",
                model=self._model,
                base_url=self._api_base_url,
                error=exc,
            ) from exc
        finally:
            close_client = getattr(client, "close", None)
            if callable(close_client):
                close_client()
                self._client = create_http_session(timeout=120.0)

        elapsed = time.perf_counter() - t0
        content = "".join(content_parts) or None
        thinking = "".join(thinking_parts) or None
        if thinking is None and (saw_reasoning_item or reasoning_tokens > 0):
            thinking = _format_reasoning_fallback(reasoning_tokens)

        logger.debug(
            "[{}] OpenAI Responses chat done: {:.2f}s, chunks={}, content_len={}, thinking_len={}, tool_calls={}",
            self._provider_name,
            elapsed,
            chunk_count,
            len(content) if content else 0,
            len(thinking) if thinking else 0,
            len(tool_calls),
        )

        if tool_calls:
            return LLMResponse(
                content=content, tool_calls=tool_calls, thinking=thinking
            )

        return LLMResponse(content=content or "", thinking=thinking)

    def list_models(
        self,
        register_interrupt: Callable[[Callable[[], None] | None], None] | None = None,
    ) -> list[ModelInfo]:
        url = f"{self._api_base_url}/models"
        client = self._client
        close_client = getattr(client, "close", None)
        if register_interrupt is not None and callable(close_client):
            register_interrupt(close_client)
        try:
            resp = client.get(url, headers=self._headers())
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
        finally:
            if callable(close_client):
                close_client()
                self._client = create_http_session(timeout=120.0)
