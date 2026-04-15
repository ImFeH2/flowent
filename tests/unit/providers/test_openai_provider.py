from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any, Literal

from app.providers.openai import OpenAIProvider


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

    def iter_lines(self) -> Iterator[str]:
        return iter(self._lines)

    def iter_content(self) -> Iterator[bytes | str]:
        return iter(self._content_chunks)

    def read(self) -> bytes:
        return b""


class _FakeClient:
    def __init__(self, responses: list[_FakeStreamResponse]) -> None:
        self._responses = responses
        self.payloads: list[dict[str, Any]] = []

    def stream(
        self,
        method: str,
        url: str,
        headers: dict[str, str],
        json: dict[str, Any],
    ) -> _FakeStreamResponse:
        self.payloads.append(json)
        return self._responses.pop(0)

    def close(self) -> None:
        return None


def _make_data_lines(*events: dict[str, Any]) -> list[str]:
    return [f"data: {json.dumps(event)}" for event in events]


def test_openai_chat_requests_stream_usage_and_returns_usage():
    provider = OpenAIProvider(
        provider_name="Test Provider",
        api_base_url="http://example.invalid",
        api_key="secret",
        model="gpt-4.1",
    )
    client = _FakeClient(
        [
            _FakeStreamResponse(
                lines=_make_data_lines(
                    {"choices": [{"delta": {"content": "Hello"}}]},
                    {
                        "choices": [],
                        "usage": {
                            "total_tokens": 21,
                            "prompt_tokens": 13,
                            "completion_tokens": 8,
                            "prompt_tokens_details": {"cached_tokens": 5},
                        },
                    },
                )
            )
        ]
    )
    provider._client = client

    response = provider.chat(messages=[{"role": "user", "content": "Say hi"}])

    assert client.payloads[0]["stream_options"] == {"include_usage": True}
    assert response.content == "Hello"
    assert response.usage is not None
    assert response.usage.total_tokens == 21
    assert response.usage.input_tokens == 13
    assert response.usage.output_tokens == 8
    assert response.usage.cached_input_tokens == 5
    assert response.usage.cache_read_tokens == 5
    assert response.raw_usage == {
        "total_tokens": 21,
        "prompt_tokens": 13,
        "completion_tokens": 8,
        "prompt_tokens_details": {"cached_tokens": 5},
    }


def test_openai_chat_retries_without_stream_usage_when_provider_rejects_it():
    provider = OpenAIProvider(
        provider_name="Test Provider",
        api_base_url="http://example.invalid",
        api_key="secret",
        model="gpt-4.1",
    )
    client = _FakeClient(
        [
            _FakeStreamResponse(
                lines=[],
                status_code=400,
                text='{"error":{"message":"Unknown field: stream_options"}}',
            ),
            _FakeStreamResponse(
                lines=_make_data_lines(
                    {"choices": [{"delta": {"content": "Recovered"}}]}
                )
            ),
        ]
    )
    provider._client = client

    response = provider.chat(messages=[{"role": "user", "content": "Say hi"}])

    assert client.payloads[0]["stream_options"] == {"include_usage": True}
    assert "stream_options" not in client.payloads[1]
    assert response.content == "Recovered"
    assert response.usage is None
    assert response.raw_usage is None
