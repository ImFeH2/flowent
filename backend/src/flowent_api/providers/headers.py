from __future__ import annotations

from collections.abc import Mapping


def merge_headers(
    builtins: Mapping[str, str],
    overrides: Mapping[str, str],
) -> dict[str, str]:
    headers = dict(builtins)
    names = {name.lower(): name for name in headers}

    for name, value in overrides.items():
        existing = names.get(name.lower())
        if existing is not None:
            headers.pop(existing, None)
        headers[name] = value
        names[name.lower()] = name

    return headers
