from __future__ import annotations


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
            f"Response: {body}"
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
            f"Error: {type(error).__name__}: {error}"
        ),
        transient=True,
    )
