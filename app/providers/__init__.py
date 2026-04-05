from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol

from app.models import LLMResponse, ModelInfo
from app.settings import ModelParams


class LLMProvider(Protocol):
    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        on_chunk: Callable[[str, str], None] | None = None,
        register_interrupt: Callable[[Callable[[], None] | None], None] | None = None,
        model_params: ModelParams | None = None,
    ) -> LLMResponse: ...

    def list_models(
        self,
        register_interrupt: Callable[[Callable[[], None] | None], None] | None = None,
    ) -> list[ModelInfo]: ...
