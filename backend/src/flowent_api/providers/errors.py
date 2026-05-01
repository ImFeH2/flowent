from __future__ import annotations

import json
import re
from typing import Any

from flowent_api.network import truncate_text


class LLMProviderError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        transient: bool,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.transient = transient
        self.status_code = status_code


def is_transient_status_code(status_code: int) -> bool:
    return status_code == 429 or 500 <= status_code < 600


def build_status_error(
    *,
    provider_name: str,
    provider_type: str,
    model: str,
    base_url: str,
    status_code: int,
    body: str,
) -> LLMProviderError:
    return LLMProviderError(
        (
            "LLM API error\n"
            f"Provider: {provider_name}\n"
            f"Type: {provider_type}\n"
            f"Model: {model}\n"
            f"Base URL: {base_url}\n"
            f"Status: {status_code}\n"
            f"Detail: {_normalize_status_detail(body)}"
        ),
        transient=is_transient_status_code(status_code),
        status_code=status_code,
    )


def build_network_error(
    *,
    provider_name: str,
    provider_type: str,
    model: str,
    base_url: str,
    error: Exception,
) -> LLMProviderError:
    return LLMProviderError(
        (
            "LLM API network error\n"
            f"Provider: {provider_name}\n"
            f"Type: {provider_type}\n"
            f"Model: {model}\n"
            f"Base URL: {base_url}\n"
            f"Error: {_normalize_network_error(error)}"
        ),
        transient=True,
    )


def build_configuration_error(
    *,
    provider_name: str,
    provider_type: str,
    model: str,
    base_url: str,
    detail: str,
) -> LLMProviderError:
    return LLMProviderError(
        (
            "LLM configuration error\n"
            f"Provider: {provider_name}\n"
            f"Type: {provider_type}\n"
            f"Model: {model}\n"
            f"Base URL: {base_url}\n"
            f"Detail: {_compact_text(detail)}"
        ),
        transient=False,
    )


def build_access_blocked_error(
    *,
    provider_name: str,
    provider_type: str,
    model: str,
    base_url: str,
    status_code: int | None = None,
    detail: str,
) -> LLMProviderError:
    status_line = f"Status: {status_code}\n" if status_code is not None else ""
    return LLMProviderError(
        (
            "LLM API access blocked\n"
            f"Provider: {provider_name}\n"
            f"Type: {provider_type}\n"
            f"Model: {model}\n"
            f"Base URL: {base_url}\n"
            f"{status_line}"
            f"Detail: {_normalize_access_blocked_detail(detail)}"
        ),
        transient=False,
        status_code=status_code,
    )


def _normalize_status_detail(body: str) -> str:
    stripped = body.strip()
    if not stripped:
        return "Provider returned an empty error response"
    if _looks_like_html(stripped):
        return "Provider returned a non-API HTML response"
    parsed = _parse_json_body(stripped)
    if parsed is not None:
        detail = _extract_detail(parsed)
        if detail is not None:
            return detail
    first_line = stripped.splitlines()[0]
    detail = _compact_text(first_line)
    if not detail or detail.lower().startswith("traceback"):
        return "Provider returned an unexpected error response"
    return detail


def _normalize_network_error(error: Exception) -> str:
    detail = str(error).strip()
    detail = re.sub(r"^[A-Za-z_][A-Za-z0-9_]*(?:Error|Exception):\s*", "", detail)
    detail = re.sub(r"^Failed to perform,\s*", "", detail)
    detail = re.sub(r"^curl:\s*\(\d+\)\s*", "", detail, flags=re.IGNORECASE)
    detail = re.sub(r"^curl\s+error:\s*", "", detail, flags=re.IGNORECASE)
    detail = re.sub(r"See https?://\S+ for more details\.?", "", detail)
    detail = _compact_text(detail)
    if not detail:
        return "Request failed before the provider returned a response"
    return detail


def _normalize_access_blocked_detail(detail: str) -> str:
    stripped = detail.strip()
    if not stripped:
        return "Challenge or interstitial response from upstream"
    if _looks_like_html(stripped):
        return "Challenge or interstitial HTML response from upstream"
    normalized = _compact_text(stripped)
    if not normalized:
        return "Challenge or interstitial response from upstream"
    return normalized


def _parse_json_body(body: str) -> Any | None:
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return None


def _extract_detail(value: Any) -> str | None:
    if isinstance(value, str):
        return _normalize_detail_text(value)
    if isinstance(value, list):
        for item in value:
            detail = _extract_detail(item)
            if detail is not None:
                return detail
        return None
    if not isinstance(value, dict):
        return None

    nested_error = value.get("error")
    if nested_error is not None:
        detail = _extract_detail(nested_error)
        if detail is not None:
            return detail

    for key in (
        "message",
        "detail",
        "error_description",
        "title",
        "status",
        "code",
    ):
        detail = _extract_detail(value.get(key))
        if detail is not None:
            return detail

    for key in ("details", "errors"):
        detail = _extract_detail(value.get(key))
        if detail is not None:
            return detail

    return None


def _normalize_detail_text(value: str) -> str | None:
    normalized = _compact_text(value)
    if not normalized:
        return None
    if normalized.lower().startswith("traceback"):
        return "Upstream returned an unexpected error response"
    return normalized


def _compact_text(value: str, *, limit: int = 240) -> str:
    return truncate_text(re.sub(r"\s+", " ", value).strip(), limit=limit)


def _looks_like_html(value: str) -> bool:
    lowered = value.lstrip().lower()
    return lowered.startswith("<!doctype html") or (
        lowered.startswith("<") and ">" in lowered
    )
