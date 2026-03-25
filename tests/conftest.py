from __future__ import annotations

import pytest


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--run-llm-evals",
        action="store_true",
        default=False,
        help="run LLM-judged behavior eval tests that require the configured default model",
    )
    parser.addoption(
        "--llm-eval-save",
        action="store",
        default="failed",
        choices=("failed", "all", "none"),
        help="control whether llm eval artifacts are persisted",
    )
    parser.addoption(
        "--llm-eval-artifacts-dir",
        action="store",
        default=".pytest-llm-eval-artifacts",
        help="directory used to persist llm eval artifacts",
    )


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "llm_eval: marks tests that require a configured live default provider/model",
    )


def pytest_collection_modifyitems(
    config: pytest.Config,
    items: list[pytest.Item],
) -> None:
    if config.getoption("--run-llm-evals"):
        return
    skip_marker = pytest.mark.skip(
        reason="need --run-llm-evals to run model-backed behavior evals",
    )
    for item in items:
        if "llm_eval" in item.keywords:
            item.add_marker(skip_marker)
