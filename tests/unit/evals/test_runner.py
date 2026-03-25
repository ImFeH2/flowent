from __future__ import annotations

import json

import pytest

from app.evals.runner import (
    EvalArtifacts,
    EvalJudgeResult,
    EvalRunResult,
    EvalScenario,
    extract_final_assistant_text,
    parse_judge_response,
    persist_eval_result,
)


def test_extract_final_assistant_text_returns_last_non_empty_text():
    history = [
        {"type": "AssistantText", "content": "first"},
        {"type": "ToolCall", "content": ""},
        {"type": "AssistantText", "content": " final answer "},
    ]

    assert extract_final_assistant_text(history) == "final answer"


def test_extract_final_assistant_text_returns_none_without_text():
    history = [
        {"type": "ToolCall", "content": ""},
        {"type": "ReceivedMessage", "content": "hi"},
    ]

    assert extract_final_assistant_text(history) is None


def test_parse_judge_response_accepts_fenced_json():
    result = parse_judge_response(
        """```json
{"pass": true, "summary": "ok", "reasons": ["matched"], "evidence": ["reply was OK"]}
```"""
    )

    assert result.passed is True
    assert result.summary == "ok"
    assert result.reasons == ["matched"]
    assert result.evidence == ["reply was OK"]


def test_parse_judge_response_rejects_invalid_schema():
    with pytest.raises(
        ValueError, match="judge response field 'pass' must be a boolean"
    ):
        parse_judge_response(
            '{"pass": "yes", "summary": "bad", "reasons": ["x"], "evidence": ["y"]}'
        )


def test_persist_eval_result_saves_failed_run_with_masked_workspace(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "logs").mkdir()
    (workspace / "logs" / "run.log").write_text("log line\n", encoding="utf-8")
    (workspace / "notes.txt").write_text("hello\n", encoding="utf-8")
    (workspace / "runtime-settings.json").write_text(
        json.dumps(
            {
                "providers": [
                    {
                        "id": "default",
                        "api_key": "sk-secret1234",
                    }
                ],
                "telegram": {
                    "bot_token": "123456:abcd",
                    "pending_chats": [],
                    "approved_chats": [],
                },
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    scenario = EvalScenario(
        name="failed_case",
        input_message="do work",
        expected_behavior="should finish",
    )
    artifacts = EvalArtifacts(
        assistant_id="assistant-1",
        assistant_state="idle",
        final_reply=None,
        timed_out=True,
        nodes=[],
        node_details=[],
        formations=[],
        formation_details=[],
    )
    result = EvalRunResult(
        scenario=scenario,
        artifacts=artifacts,
        judge=None,
        failure="scenario timed out before the system became quiescent",
    )

    artifact_dir = persist_eval_result(
        output_root=tmp_path / "artifacts",
        workspace_dir=workspace,
        scenario=scenario,
        result=result,
        save_mode="failed",
    )

    assert artifact_dir is not None
    summary = json.loads((artifact_dir / "summary.json").read_text(encoding="utf-8"))
    saved_artifacts = json.loads(
        (artifact_dir / "artifacts.json").read_text(encoding="utf-8")
    )
    masked_settings = json.loads(
        (artifact_dir / "workspace" / "runtime-settings.json").read_text(
            encoding="utf-8"
        )
    )

    assert summary["scenario"]["name"] == "failed_case"
    assert summary["result"]["failure"] == result.failure
    assert saved_artifacts["timed_out"] is True
    assert (artifact_dir / "logs" / "run.log").read_text(
        encoding="utf-8"
    ) == "log line\n"
    assert (artifact_dir / "workspace" / "notes.txt").read_text(
        encoding="utf-8"
    ) == "hello\n"
    assert masked_settings["providers"][0]["api_key"] == "sk-...1234"
    assert masked_settings["telegram"]["bot_token"].endswith("abcd")
    assert masked_settings["telegram"]["bot_token"] != "123456:abcd"


def test_persist_eval_result_skips_passing_run_in_failed_mode(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    scenario = EvalScenario(
        name="passing_case",
        input_message="reply",
        expected_behavior="should reply",
    )
    artifacts = EvalArtifacts(
        assistant_id="assistant-1",
        assistant_state="idle",
        final_reply="OK",
        timed_out=False,
        nodes=[],
        node_details=[],
        formations=[],
        formation_details=[],
    )
    judge = EvalJudgeResult(
        passed=True,
        summary="ok",
        reasons=["matched"],
        evidence=["reply was OK"],
        raw_response='{"pass": true}',
    )
    result = EvalRunResult(
        scenario=scenario,
        artifacts=artifacts,
        judge=judge,
        failure=None,
    )

    artifact_dir = persist_eval_result(
        output_root=tmp_path / "artifacts",
        workspace_dir=workspace,
        scenario=scenario,
        result=result,
        save_mode="failed",
    )

    assert artifact_dir is None
    assert list((tmp_path / "artifacts").glob("*")) == []
