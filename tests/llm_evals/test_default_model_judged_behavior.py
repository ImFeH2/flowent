from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.evals import EvalScenario


def _write_sample_settings_json(workspace: Path) -> None:
    payload = {
        "name": "demo",
        "enabled": True,
        "count": 3,
    }
    content = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    (workspace / "settings.json").write_text(content, encoding="utf-8")


SCENARIOS = [
    EvalScenario(
        name="direct_reply_ok",
        input_message="你好, 回复一个OK",
        expected_behavior=(
            "Assistant should reply directly to the Human without creating any "
            "task tab or extra nodes. The final reply should be a minimal direct "
            "confirmation equivalent to 'OK'."
        ),
        timeout_seconds=30.0,
    ),
    EvalScenario(
        name="single_worker_line_count",
        input_message="帮我看一下 settings.json 这个文件有多少行",
        expected_behavior=(
            "Assistant should treat this as a real execution task rather than "
            "answering from memory. It should create a task tab, create a worker "
            "node, delegate the work, and return a final Human-facing reply that "
            "includes settings.json and the correct line count of 5."
        ),
        timeout_seconds=90.0,
        setup_workspace=_write_sample_settings_json,
    ),
]


@pytest.mark.llm_eval
@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda scenario: scenario.name)
def test_default_model_judged_behavior(
    run_llm_eval_scenario,
    format_llm_eval_failure,
    scenario: EvalScenario,
):
    result, artifact_dir = run_llm_eval_scenario(scenario)

    assert result.failure is None, format_llm_eval_failure(result.failure, artifact_dir)
    assert result.judge is not None
    assert result.judge.passed, (
        f"{result.judge.summary}\n"
        f"Reasons: {result.judge.reasons}\n"
        f"Evidence: {result.judge.evidence}"
        f"{format_llm_eval_failure('', artifact_dir)}"
    )
