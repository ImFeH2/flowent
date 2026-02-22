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
from app.providers.sse import iter_sse_json


class GeminiProvider(LLMProvider):
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

    def _convert_messages(
        self,
        messages: list[dict[str, Any]],
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
        system_parts: list[str] = []
        contents: list[dict[str, Any]] = []
        tool_call_names: dict[str, str] = {}

        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content")

            if role == "system":
                if isinstance(content, str):
                    if content:
                        system_parts.append(content)
                elif content is not None:
                    system_parts.append(str(content))
                continue

            if role == "user":
                contents.append(
                    {
                        "role": "user",
                        "parts": [{"text": content or ""}],
                    },
                )
                continue

            if role == "assistant":
                parts: list[dict[str, Any]] = []

                if content:
                    parts.append({"text": content})

                for tc in msg.get("tool_calls", []) or []:
                    fn = tc.get("function", {})
                    name = fn.get("name", "")
                    call_id = tc.get("id", "")
                    if call_id and name:
                        tool_call_names[call_id] = name

                    raw_args = fn.get("arguments", {})
                    if isinstance(raw_args, str):
                        try:
                            args = json.loads(raw_args) if raw_args else {}
                        except json.JSONDecodeError:
                            args = {}
                    elif isinstance(raw_args, dict):
                        args = raw_args
                    else:
                        args = {}

                    if not isinstance(args, dict):
                        args = {}

                    parts.append(
                        {
                            "functionCall": {
                                "name": name,
                                "args": args,
                            }
                        },
                    )

                if parts:
                    contents.append(
                        {
                            "role": "model",
                            "parts": parts,
                        },
                    )
                continue

            if role == "tool":
                tool_call_id = msg.get("tool_call_id", "")
                name = tool_call_names.get(tool_call_id, msg.get("name", ""))
                contents.append(
                    {
                        "role": "user",
                        "parts": [
                            {
                                "functionResponse": {
                                    "name": name,
                                    "response": {"content": content or ""},
                                }
                            }
                        ],
                    },
                )

        system_instruction = None
        if system_parts:
            system_instruction = {"parts": [{"text": "\n\n".join(system_parts)}]}

        return system_instruction, contents

    def _convert_tools(self, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
        declarations = []
        for tool in tools:
            fn = tool.get("function", {})
            decl: dict[str, Any] = {
                "name": fn.get("name", ""),
                "description": fn.get("description", ""),
            }
            params = fn.get("parameters")
            if params:
                decl["parameters"] = params
            declarations.append(decl)
        return [{"function_declarations": declarations}]

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        on_chunk: Callable[[str, str], None] | None = None,
    ) -> LLMResponse:
        url = (
            f"{self._api_base_url}/v1beta/models/{self._model}"
            f":streamGenerateContent?alt=sse&key={self._api_key}"
        )

        system_instruction, contents = self._convert_messages(messages)

        payload: dict[str, Any] = {"contents": contents}
        if system_instruction:
            payload["system_instruction"] = system_instruction
        if tools:
            payload["tools"] = self._convert_tools(tools)

        logger.debug(
            "[{}] Gemini chat request: model={}, messages={}, tools={}",
            self._provider_name,
            self._model,
            len(contents),
            len(tools) if tools else 0,
        )

        t0 = time.perf_counter()

        content_parts: list[str] = []
        tool_calls_list: list[ToolCall] = []
        chunk_count = 0

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
                    "LLM API error [provider={}, model={}, type=gemini]: {} - {} ({:.2f}s)",
                    self._provider_name,
                    self._model,
                    response.status_code,
                    body[:500],
                    elapsed,
                )
                raise RuntimeError(
                    f"LLM API error\n"
                    f"Provider: {self._provider_name}\n"
                    f"Type: gemini\n"
                    f"Model: {self._model}\n"
                    f"Base URL: {self._api_base_url}\n"
                    f"Status: {response.status_code}\n"
                    f"Response: {body}",
                )

            for chunk in iter_sse_json(response):
                chunk_count += 1
                candidates = chunk.get("candidates", [])
                if not candidates:
                    continue

                parts = candidates[0].get("content", {}).get("parts", [])
                for part in parts:
                    if "text" in part:
                        text = part["text"]
                        content_parts.append(text)
                        if on_chunk:
                            on_chunk("content", text)
                    elif "functionCall" in part:
                        fc = part["functionCall"]
                        tool_calls_list.append(
                            ToolCall(
                                id=str(uuid.uuid4()),
                                name=fc.get("name", ""),
                                arguments=fc.get("args", {}),
                            ),
                        )

        elapsed = time.perf_counter() - t0
        content = "".join(content_parts) or None

        logger.debug(
            "[{}] Gemini chat done: {:.2f}s, chunks={}, content_len={}, tool_calls={}",
            self._provider_name,
            elapsed,
            chunk_count,
            len(content) if content else 0,
            len(tool_calls_list),
        )

        if tool_calls_list:
            return LLMResponse(content=content, tool_calls=tool_calls_list)

        return LLMResponse(content=content or "")

    def list_models(self) -> list[ModelInfo]:
        url = f"{self._api_base_url}/v1beta/models?key={self._api_key}"
        try:
            resp = self._client.get(url)
            resp.raise_for_status()
            data = resp.json()
            models = data.get("models", [])
            result = []
            for m in models:
                methods = m.get("supportedGenerationMethods", [])
                if "generateContent" in methods:
                    model_id = m.get("name", "").removeprefix("models/")
                    result.append(ModelInfo(id=model_id))
            return result
        except Exception as e:
            logger.error(
                "Failed to list models [provider={}, type=gemini]: {}",
                self._provider_name,
                e,
            )
            return []
