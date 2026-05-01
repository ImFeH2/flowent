from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any, Literal

import pytest

from flowent_api.providers.anthropic import AnthropicProvider
from flowent_api.providers.errors import LLMProviderError


class _FakeStreamResponse:
    def __init__(
        self,
        *,
        lines: list[str],
        status_code: int = 200,
        headers: dict[str, str] | None = None,
        text: str = "",
        content_chunks: list[bytes | str] | None = None,
    ) -> None:
        self._lines = lines
        self.status_code = status_code
        self.headers = headers or {}
        self.text = text
        self._content_chunks = content_chunks or []

    def __enter__(self) -> _FakeStreamResponse:
        return self

    def __exit__(self, exc_type, exc, tb) -> Literal[False]:
        return False

    def close(self) -> None:
        return None

    def iter_lines(self) -> Iterator[str]:
        return iter(self._lines)

    def iter_content(self) -> Iterator[bytes | str]:
        return iter(self._content_chunks)

    def read(self) -> bytes:
        return b""


class _FakeJsonResponse:
    def __init__(
        self,
        payload: dict[str, Any] | None = None,
        status_code: int = 200,
    ) -> None:
        self._payload = payload or {}
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"status {self.status_code}")

    def json(self) -> dict[str, Any]:
        return self._payload


class _FakeClient:
    def __init__(
        self,
        *,
        responses: list[_FakeStreamResponse] | None = None,
        json_payload: dict[str, Any] | None = None,
        status_code: int = 200,
    ) -> None:
        self._responses = responses or []
        self._json_payload = json_payload or {}
        self._status_code = status_code
        self.last_stream_url: str | None = None
        self.last_get_url: str | None = None
        self.last_headers: dict[str, str] | None = None
        self.last_payload: dict[str, Any] | None = None

    def stream(
        self,
        method: str,
        url: str,
        headers: dict[str, str],
        json: dict[str, Any],
    ) -> _FakeStreamResponse:
        self.last_stream_url = url
        self.last_headers = headers
        self.last_payload = json
        return self._responses.pop(0)

    def get(self, url: str, headers: dict[str, str]) -> _FakeJsonResponse:
        self.last_get_url = url
        self.last_headers = headers
        return _FakeJsonResponse(
            payload=self._json_payload,
            status_code=self._status_code,
        )

    def close(self) -> None:
        return None


def _make_data_lines(*events: dict[str, Any]) -> list[str]:
    return [f"data: {json.dumps(event)}" for event in events]


def test_anthropic_chat_uses_resolved_base_url_without_duplicate_v1():
    provider = AnthropicProvider(
        provider_name="Test Provider",
        api_base_url="http://example.invalid/v1",
        api_key="secret",
        headers={"x-api-key": "override", "X-Test": "value"},
        model="claude-3-7-sonnet",
    )
    client = _FakeClient(
        responses=[
            _FakeStreamResponse(
                lines=_make_data_lines(
                    {
                        "type": "content_block_delta",
                        "delta": {"type": "text_delta", "text": "Hello"},
                    },
                    {"type": "message_stop"},
                )
            )
        ]
    )
    provider._client = client

    response = provider.chat(messages=[{"role": "user", "content": "Say hi"}])

    assert client.last_stream_url == "http://example.invalid/v1/messages"
    assert response.content == "Hello"
    assert client.last_headers == {
        "Content-Type": "application/json",
        "x-api-key": "override",
        "anthropic-version": "2023-06-01",
        "X-Test": "value",
    }


def test_anthropic_list_models_uses_resolved_base_url_without_duplicate_v1():
    provider = AnthropicProvider(
        provider_name="Test Provider",
        api_base_url="http://example.invalid/v1",
        api_key="secret",
        model="claude-3-7-sonnet",
    )
    client = _FakeClient(
        json_payload={"data": [{"id": "claude-3-7-sonnet"}]},
    )
    provider._client = client

    models = provider.list_models()

    assert client.last_get_url == "http://example.invalid/v1/models"
    assert [model.id for model in models] == ["claude-3-7-sonnet"]


def test_anthropic_chat_surfaces_status_error_detail_without_duplicate_v1():
    provider = AnthropicProvider(
        provider_name="Test Provider",
        api_base_url="http://example.invalid/v1",
        api_key="secret",
        model="claude-3-7-sonnet",
    )
    client = _FakeClient(
        responses=[
            _FakeStreamResponse(
                lines=[],
                status_code=404,
                text='{"error":{"message":"Not found"}}',
            )
        ]
    )
    provider._client = client

    with pytest.raises(LLMProviderError) as excinfo:
        provider.chat(messages=[{"role": "user", "content": "Hello"}])

    assert client.last_stream_url == "http://example.invalid/v1/messages"
    assert excinfo.value.status_code == 404
    assert "Base URL: http://example.invalid/v1" in str(excinfo.value)
