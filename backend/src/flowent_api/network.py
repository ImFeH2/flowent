from __future__ import annotations

from collections.abc import Iterator
from typing import Any, Literal

from curl_cffi.requests import AsyncSession, Session
from curl_cffi.requests.exceptions import RequestException

DEFAULT_BROWSER_IMPERSONATE: Literal["chrome"] = "chrome"


def create_http_session(
    *,
    timeout: float,
    impersonate_browser: bool = False,
) -> Session:
    kwargs: dict[str, Any] = {"timeout": timeout}
    if impersonate_browser:
        kwargs["impersonate"] = DEFAULT_BROWSER_IMPERSONATE
    return Session(**kwargs)


def create_async_http_session(
    *,
    timeout: float,
    impersonate_browser: bool = False,
) -> AsyncSession:
    kwargs: dict[str, Any] = {"timeout": timeout}
    if impersonate_browser:
        kwargs["impersonate"] = DEFAULT_BROWSER_IMPERSONATE
    return AsyncSession(**kwargs)


def is_success_status(status_code: int) -> bool:
    return 200 <= status_code < 300


def iter_response_lines(response: Any) -> Iterator[str]:
    for line in response.iter_lines():
        normalized = _decode_to_text(line)
        if normalized:
            yield normalized


def iter_response_text(response: Any) -> Iterator[str]:
    iter_text = getattr(response, "iter_text", None)
    if callable(iter_text):
        for chunk in iter_text():
            normalized = _decode_to_text(chunk)
            if normalized:
                yield normalized
        return

    for chunk in response.iter_content():
        normalized = _decode_to_text(chunk)
        if normalized:
            yield normalized


def read_response_text(response: Any) -> str:
    text = getattr(response, "text", None)
    if isinstance(text, str) and text:
        return text

    content = getattr(response, "content", None)
    if isinstance(content, str) and content:
        return content
    if isinstance(content, (bytes, bytearray)) and content:
        return bytes(content).decode("utf-8", errors="replace")

    iter_text = getattr(response, "iter_text", None)
    if callable(iter_text):
        chunks = [_decode_to_text(chunk) for chunk in iter_text()]
        if chunks:
            return "".join(chunks)

    iter_content = getattr(response, "iter_content", None)
    if callable(iter_content):
        chunks = [_decode_to_text(chunk) for chunk in iter_content()]
        if chunks:
            return "".join(chunks)

    read = getattr(response, "read", None)
    if callable(read):
        payload = read()
        if isinstance(payload, str):
            return payload
        if isinstance(payload, (bytes, bytearray)):
            return bytes(payload).decode("utf-8", errors="replace")

    return ""


def get_response_header(response: Any, header_name: str) -> str | None:
    headers = getattr(response, "headers", None)
    if headers is None:
        return None
    getter = getattr(headers, "get", None)
    if callable(getter):
        value = getter(header_name)
        if isinstance(value, str):
            return value
    if isinstance(headers, dict):
        value = headers.get(header_name) or headers.get(header_name.lower())
        if isinstance(value, str):
            return value
    return None


def response_looks_like_html(response: Any) -> bool:
    content_type = get_response_header(response, "content-type")
    if not isinstance(content_type, str):
        return False
    normalized = content_type.lower()
    return "text/html" in normalized or "application/xhtml+xml" in normalized


def truncate_text(text: str, limit: int = 500) -> str:
    if len(text) <= limit:
        return text
    return text[:limit]


def _decode_to_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).decode("utf-8", errors="replace")
    return str(value)


__all__ = [
    "DEFAULT_BROWSER_IMPERSONATE",
    "AsyncSession",
    "RequestException",
    "Session",
    "create_async_http_session",
    "create_http_session",
    "get_response_header",
    "is_success_status",
    "iter_response_lines",
    "iter_response_text",
    "read_response_text",
    "response_looks_like_html",
    "truncate_text",
]
