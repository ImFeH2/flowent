from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

from flowent_api.network import iter_response_lines


def iter_sse_data(response: Any) -> Iterator[str]:
    for line in iter_response_lines(response):
        if not line or line.startswith(":"):
            continue
        if not line.startswith("data: "):
            continue
        yield line[6:]


def iter_sse_json(
    response: Any,
    done_token: str | None = None,
) -> Iterator[dict[str, Any]]:
    for payload in iter_sse_data(response):
        if done_token is not None and payload.strip() == done_token:
            break
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            yield parsed
