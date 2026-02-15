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

        for msg in messages:
            role = msg["role"]
            if role == "system":
                system_parts.append(msg["content"])
            else:
                gemini_role = "model" if role == "assistant" else "user"
                contents.append(
                    {
                        "role": gemini_role,
                        "parts": [{"text": msg["content"]}],
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

            for line in response.iter_lines():
                if not line or line.startswith(":"):
                    continue
                if not line.startswith("data: "):
                    continue
                data_str = line[6:]

                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

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
