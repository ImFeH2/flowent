from __future__ import annotations

import json
import time
import uuid
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
from app.providers.thinking import ThinkTagParser
from app.settings import ModelParams


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
        self._client = create_http_session(timeout=120.0)

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        on_chunk: Callable[[str, str], None] | None = None,
        register_interrupt: Callable[[Callable[[], None] | None], None] | None = None,
        model_params: ModelParams | None = None,
    ) -> LLMResponse:
        url = f"{self._api_base_url}/api/chat"

        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "stream": True,
        }
        if model_params is not None:
            options: dict[str, Any] = {}
            if model_params.max_output_tokens is not None:
                options["num_predict"] = model_params.max_output_tokens
            if model_params.temperature is not None:
                options["temperature"] = model_params.temperature
            if model_params.top_p is not None:
                options["top_p"] = model_params.top_p
            if options:
                payload["options"] = options
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
        client = self._client
        if register_interrupt is not None:
            register_interrupt(client.close)

        try:
            with client.stream(
                "POST",
                url,
                headers={"Content-Type": "application/json"},
                json=payload,
            ) as response:
                if register_interrupt is not None:
                    register_interrupt(response.close)
                if response_looks_like_html(response):
                    raise build_access_blocked_error(
                        provider_name=self._provider_name,
                        provider_type="ollama",
                        model=self._model,
                        base_url=self._api_base_url,
                        status_code=response.status_code,
                        detail=truncate_text(read_response_text(response)),
                    )
                if response.status_code != 200:
                    body = truncate_text(read_response_text(response))
                    elapsed = time.perf_counter() - t0
                    logger.error(
                        "LLM API error [provider={}, model={}, type=ollama]: {} - {} ({:.2f}s)",
                        self._provider_name,
                        self._model,
                        response.status_code,
                        body[:500],
                        elapsed,
                    )
                    raise build_status_error(
                        provider_name=self._provider_name,
                        provider_type="ollama",
                        model=self._model,
                        base_url=self._api_base_url,
                        status_code=response.status_code,
                        body=body,
                    )

                for line in iter_response_lines(response):
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
        except RequestException as exc:
            elapsed = time.perf_counter() - t0
            logger.warning(
                "LLM API transport error [provider={}, model={}, type=ollama]: {} ({:.2f}s)",
                self._provider_name,
                self._model,
                exc,
                elapsed,
            )
            raise build_network_error(
                provider_name=self._provider_name,
                provider_type="ollama",
                model=self._model,
                base_url=self._api_base_url,
                error=exc,
            ) from exc
        finally:
            close_client = getattr(client, "close", None)
            if callable(close_client):
                close_client()
                self._client = create_http_session(timeout=120.0)

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

    def list_models(
        self,
        register_interrupt: Callable[[Callable[[], None] | None], None] | None = None,
    ) -> list[ModelInfo]:
        url = f"{self._api_base_url}/api/tags"
        client = self._client
        close_client = getattr(client, "close", None)
        if register_interrupt is not None and callable(close_client):
            register_interrupt(close_client)
        try:
            resp = client.get(url)
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
        finally:
            if callable(close_client):
                close_client()
                self._client = create_http_session(timeout=120.0)
