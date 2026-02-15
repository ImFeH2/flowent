from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol

from app.models import LLMResponse, ModelInfo


class LLMProvider(Protocol):
    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        on_chunk: Callable[[str, str], None] | None = None,
    ) -> LLMResponse: ...

    def list_models(self) -> list[ModelInfo]: ...
