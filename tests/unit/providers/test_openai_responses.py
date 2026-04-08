from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any, Literal

import pytest

from app.providers.errors import LLMProviderError
from app.providers.openai_responses import (
    OpenAIResponsesProvider,
    _extract_reasoning_text_from_item,
)
from app.settings import ModelParams


class _FakeStreamResponse:
    def __init__(
        self,
        lines: list[str],
        status_code: int = 200,
        headers: dict[str, str] | None = None,
        text: str = "",
    ) -> None:
        self._lines = lines
        self.status_code = status_code
        self.headers = headers or {}
        self.text = text

    def __enter__(self) -> _FakeStreamResponse:
        return self

    def __exit__(self, exc_type, exc, tb) -> Literal[False]:
        return False

    def iter_lines(self) -> Iterator[str]:
        return iter(self._lines)

    def read(self) -> bytes:
        return b""


class _FakeClient:
    def __init__(
        self,
        lines: list[str],
        status_code: int = 200,
        headers: dict[str, str] | None = None,
        text: str = "",
    ) -> None:
        self._lines = lines
        self._status_code = status_code
        self._headers = headers or {}
        self._text = text
        self.last_payload: dict[str, Any] | None = None

    def stream(
        self,
        method: str,
        url: str,
        headers: dict[str, str],
        json: dict[str, Any],
    ) -> _FakeStreamResponse:
        self.last_payload = json
        return _FakeStreamResponse(
            self._lines,
            status_code=self._status_code,
            headers=self._headers,
            text=self._text,
        )


def _make_data_lines(*events: dict[str, Any]) -> list[str]:
    return [f"data: {json.dumps(event)}" for event in events]


def test_extract_reasoning_text_from_item_reads_summary_and_content():
    item = {
        "type": "reasoning",
        "summary": [{"type": "summary_text", "text": "Summary text."}],
        "content": [{"type": "reasoning_text", "text": "Raw text."}],
    }

    assert _extract_reasoning_text_from_item(item) == "Summary text.Raw text."


def test_openai_responses_requests_reasoning_and_returns_summary_text():
    provider = OpenAIResponsesProvider(
        provider_name="Test Provider",
        api_base_url="http://example.invalid",
        api_key="secret",
        model="gpt-5.2",
    )
    provider._client = _FakeClient(
        _make_data_lines(
            {
                "type": "response.output_item.done",
                "item": {
                    "id": "rs_1",
                    "type": "reasoning",
                    "summary": [
                        {"type": "summary_text", "text": "Checked the prompt."}
                    ],
                },
            },
            {"type": "response.output_text.delta", "delta": "221"},
            {
                "type": "response.completed",
                "response": {
                    "output": [
                        {
                            "id": "rs_1",
                            "type": "reasoning",
                            "summary": [
                                {
                                    "type": "summary_text",
                                    "text": "Checked the prompt.",
                                }
                            ],
                        }
                    ],
                    "usage": {"output_tokens_details": {"reasoning_tokens": 5}},
                },
            },
        )
    )
    chunks: list[tuple[str, str]] = []

    response = provider.chat(
        messages=[{"role": "user", "content": "What is 13 * 17?"}],
        on_chunk=lambda chunk_type, text: chunks.append((chunk_type, text)),
        model_params=ModelParams(
            reasoning_effort="medium",
            verbosity="medium",
        ),
    )

    assert provider._client.last_payload is not None
    assert provider._client.last_payload["reasoning"] == {
        "effort": "medium",
        "summary": "detailed",
    }
    assert response.content == "221"
    assert response.thinking == "Checked the prompt."
    assert chunks == [("thinking", "Checked the prompt."), ("content", "221")]


def test_openai_responses_falls_back_when_reasoning_is_encrypted_only():
    provider = OpenAIResponsesProvider(
        provider_name="Test Provider",
        api_base_url="http://example.invalid",
        api_key="secret",
        model="gpt-5.2",
    )
    provider._client = _FakeClient(
        _make_data_lines(
            {
                "type": "response.output_item.added",
                "item": {
                    "id": "rs_1",
                    "type": "reasoning",
                    "summary": [],
                    "encrypted_content": "opaque",
                },
            },
            {
                "type": "response.output_item.done",
                "item": {
                    "id": "rs_1",
                    "type": "reasoning",
                    "summary": [],
                    "encrypted_content": "opaque",
                },
            },
            {"type": "response.output_text.delta", "delta": "Done"},
            {
                "type": "response.completed",
                "response": {
                    "output": [
                        {
                            "id": "rs_1",
                            "type": "reasoning",
                            "summary": [],
                            "encrypted_content": "opaque",
                        }
                    ],
                    "usage": {"output_tokens_details": {"reasoning_tokens": 21}},
                },
            },
        )
    )

    response = provider.chat(
        messages=[{"role": "user", "content": "Solve this."}],
        model_params=ModelParams(
            reasoning_effort="medium",
            verbosity="medium",
        ),
    )

    assert response.content == "Done"
    assert response.thinking is not None
    assert response.thinking == "Internal reasoning · 21"


def test_openai_responses_skips_reasoning_config_for_non_reasoning_models():
    provider = OpenAIResponsesProvider(
        provider_name="Test Provider",
        api_base_url="http://example.invalid",
        api_key="secret",
        model="gpt-4o-mini",
    )
    provider._client = _FakeClient(
        _make_data_lines(
            {"type": "response.output_text.delta", "delta": "Hello"},
            {"type": "response.completed", "response": {"output": []}},
        )
    )

    response = provider.chat(messages=[{"role": "user", "content": "Say hi"}])

    assert provider._client.last_payload is not None
    assert "reasoning" not in provider._client.last_payload
    assert response.content == "Hello"
    assert response.thinking is None


def test_openai_responses_marks_429_as_transient_error():
    provider = OpenAIResponsesProvider(
        provider_name="Test Provider",
        api_base_url="http://example.invalid",
        api_key="secret",
        model="gpt-5.2",
    )
    provider._client = _FakeClient([], status_code=429)

    with pytest.raises(LLMProviderError) as excinfo:
        provider.chat(messages=[{"role": "user", "content": "Retry me"}])

    assert excinfo.value.transient is True
    assert excinfo.value.status_code == 429


def test_openai_responses_rejects_html_challenge_page():
    provider = OpenAIResponsesProvider(
        provider_name="Test Provider",
        api_base_url="http://example.invalid",
        api_key="secret",
        model="gpt-5.2",
    )
    provider._client = _FakeClient(
        [],
        headers={"content-type": "text/html; charset=utf-8"},
        text="<html><title>Just a moment...</title></html>",
    )

    with pytest.raises(LLMProviderError) as excinfo:
        provider.chat(messages=[{"role": "user", "content": "Hello"}])

    assert excinfo.value.transient is False
    assert "access blocked" in str(excinfo.value)
