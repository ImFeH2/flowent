from __future__ import annotations

import json
import time
from collections.abc import Callable
from typing import Any

from loguru import logger

from app.model_metadata import build_model_info
from app.models import LLMResponse, ModelInfo
from app.models import ToolCallResult as ToolCall
from app.network import (
    RequestException,
    create_http_session,
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
from app.providers.sse import iter_sse_json
from app.providers.thinking import ThinkTagParser
from app.settings import ModelParams


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
        headers: dict[str, str] | None = None,
        model: str = "",
        request_timeout_seconds: float = 120.0,
    ) -> None:
        self._provider_name = provider_name
        self._api_base_url = api_base_url.rstrip("/")
        self._api_key = api_key
        self._header_overrides = dict(headers or {})
        self._model = model
        self._request_timeout_seconds = request_timeout_seconds
        self._client = create_http_session(timeout=self._request_timeout_seconds)

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return merge_headers(headers, self._header_overrides)

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        on_chunk: Callable[[str, str], None] | None = None,
        register_interrupt: Callable[[Callable[[], None] | None], None] | None = None,
        model_params: ModelParams | None = None,
    ) -> LLMResponse:
        url = f"{self._api_base_url}/chat/completions"
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "stream": True,
        }
        if model_params is not None:
            if model_params.max_output_tokens is not None:
                payload["max_tokens"] = model_params.max_output_tokens
            if model_params.temperature is not None:
                payload["temperature"] = model_params.temperature
            if model_params.top_p is not None:
                payload["top_p"] = model_params.top_p
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
                        provider_type="openai",
                        model=self._model,
                        base_url=self._api_base_url,
                        status_code=response.status_code,
                        detail=truncate_text(read_response_text(response)),
                    )
                if response.status_code != 200:
                    body = truncate_text(read_response_text(response))
                    elapsed = time.perf_counter() - t0
                    logger.error(
                        "LLM API error [provider={}, model={}, type=openai]: {} - {} ({:.2f}s)",
                        self._provider_name,
                        self._model,
                        response.status_code,
                        body[:500],
                        elapsed,
                    )
                    raise build_status_error(
                        provider_name=self._provider_name,
                        provider_type="openai",
                        model=self._model,
                        base_url=self._api_base_url,
                        status_code=response.status_code,
                        body=body,
                    )

                for chunk in iter_sse_json(response, done_token="[DONE]"):
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
        except RequestException as exc:
            elapsed = time.perf_counter() - t0
            logger.warning(
                "LLM API transport error [provider={}, model={}, type=openai]: {} ({:.2f}s)",
                self._provider_name,
                self._model,
                exc,
                elapsed,
            )
            raise build_network_error(
                provider_name=self._provider_name,
                provider_type="openai",
                model=self._model,
                base_url=self._api_base_url,
                error=exc,
            ) from exc
        finally:
            close_client = getattr(client, "close", None)
            if callable(close_client):
                close_client()
                self._client = create_http_session(
                    timeout=self._request_timeout_seconds
                )

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
            return [
                build_model_info(
                    provider_type="openai_compatible",
                    model_id=m["id"],
                )
                for m in models
            ]
        except Exception as e:
            logger.error(
                "Failed to list models [provider={}, type=openai]: {}",
                self._provider_name,
                e,
            )
            return []
        finally:
            if callable(close_client):
                close_client()
                self._client = create_http_session(
                    timeout=self._request_timeout_seconds
                )
