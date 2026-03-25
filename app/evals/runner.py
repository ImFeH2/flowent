from __future__ import annotations

import json
import shutil
import time
import traceback
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.providers.gateway import gateway
from app.settings import find_provider, get_settings, mask_secret

JUDGE_SYSTEM_PROMPT = """You are a strict behavior evaluator for an agent system.

You will receive:
- a test scenario
- the expected behavior
- runtime artifacts collected after execution

Rules:
- Decide pass/fail only from the provided artifacts.
- Do not assume behavior that is not evidenced in the artifacts.
- If the evidence is insufficient, fail.
- Focus on whether the observed behavior matches the expected behavior.
- Return JSON only.

Required JSON schema:
{
  "pass": true,
  "summary": "short summary",
  "reasons": ["reason 1", "reason 2"],
  "evidence": ["evidence 1", "evidence 2"]
}
"""


@dataclass(frozen=True)
class EvalScenario:
    name: str
    input_message: str
    expected_behavior: str
    timeout_seconds: float = 90.0
    setup_workspace: Callable[[Path], None] | None = None


@dataclass(frozen=True)
class EvalArtifacts:
    assistant_id: str
    assistant_state: str
    final_reply: str | None
    timed_out: bool
    nodes: list[dict[str, Any]]
    node_details: list[dict[str, Any]]
    formations: list[dict[str, Any]]
    formation_details: list[dict[str, Any]]

    def to_judge_payload(self) -> dict[str, Any]:
        return {
            "assistant_id": self.assistant_id,
            "assistant_state": self.assistant_state,
            "final_reply": self.final_reply,
            "timed_out": self.timed_out,
            "nodes": self.nodes,
            "node_details": self.node_details,
            "formations": self.formations,
            "formation_details": self.formation_details,
        }


@dataclass(frozen=True)
class EvalJudgeResult:
    passed: bool
    summary: str
    reasons: list[str]
    evidence: list[str]
    raw_response: str


@dataclass(frozen=True)
class EvalRunResult:
    scenario: EvalScenario
    artifacts: EvalArtifacts
    judge: EvalJudgeResult | None
    failure: str | None = None

    @property
    def passed(self) -> bool:
        if self.failure is not None:
            return False
        return self.judge.passed if self.judge is not None else False


EvalSaveMode = str


def extract_final_assistant_text(history: list[dict[str, Any]]) -> str | None:
    for entry in reversed(history):
        if entry.get("type") == "AssistantText":
            content = entry.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
    return None


def parse_judge_response(raw_response: str) -> EvalJudgeResult:
    payload = _extract_json_payload(raw_response)
    data = json.loads(payload)
    if not isinstance(data, dict):
        raise ValueError("judge response must be a JSON object")
    passed = data.get("pass")
    summary = data.get("summary")
    reasons = data.get("reasons")
    evidence = data.get("evidence")
    if not isinstance(passed, bool):
        raise ValueError("judge response field 'pass' must be a boolean")
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError("judge response field 'summary' must be a non-empty string")
    if not isinstance(reasons, list) or not all(
        isinstance(reason, str) and reason.strip() for reason in reasons
    ):
        raise ValueError("judge response field 'reasons' must be a list of strings")
    if not isinstance(evidence, list) or not all(
        isinstance(item, str) and item.strip() for item in evidence
    ):
        raise ValueError("judge response field 'evidence' must be a list of strings")
    return EvalJudgeResult(
        passed=passed,
        summary=summary.strip(),
        reasons=[reason.strip() for reason in reasons],
        evidence=[item.strip() for item in evidence],
        raw_response=raw_response,
    )


def evaluate_scenario(client: TestClient, scenario: EvalScenario) -> EvalRunResult:
    _validate_llm_eval_configuration()
    assistant = client.get("/api/assistant").json()
    assistant_id = assistant["id"]
    assistant_detail = client.get(f"/api/nodes/{assistant_id}").json()
    initial_history_length = len(assistant_detail["history"])

    response = client.post(
        "/api/assistant/message",
        json={"content": scenario.input_message},
    )
    response.raise_for_status()

    timed_out = not _wait_for_quiescence(
        client=client,
        assistant_id=assistant_id,
        initial_history_length=initial_history_length,
        timeout_seconds=scenario.timeout_seconds,
    )
    artifacts = _collect_artifacts(
        client=client,
        assistant_id=assistant_id,
        timed_out=timed_out,
    )
    failure = _detect_infrastructure_failure(artifacts)
    if failure is not None:
        return EvalRunResult(
            scenario=scenario,
            artifacts=artifacts,
            judge=None,
            failure=failure,
        )

    judge = _judge_scenario(scenario=scenario, artifacts=artifacts)
    return EvalRunResult(
        scenario=scenario,
        artifacts=artifacts,
        judge=judge,
        failure=None,
    )


def persist_eval_result(
    *,
    output_root: Path,
    workspace_dir: Path,
    scenario: EvalScenario,
    result: EvalRunResult | None,
    save_mode: EvalSaveMode = "failed",
    error: BaseException | None = None,
) -> Path | None:
    normalized_mode = save_mode.strip().lower()
    if normalized_mode not in {"none", "failed", "all"}:
        raise ValueError(f"unsupported eval save mode: {save_mode}")
    if normalized_mode == "none":
        return None
    should_save = normalized_mode == "all"
    if not should_save:
        should_save = error is not None or result is None or not result.passed
    if not should_save:
        return None

    output_root.mkdir(parents=True, exist_ok=True)
    artifact_dir = output_root / _allocate_artifact_dir_name(scenario.name)
    artifact_dir.mkdir(parents=True, exist_ok=False)

    summary_payload = {
        "saved_at": datetime.now().astimezone().isoformat(),
        "scenario": {
            "name": scenario.name,
            "input_message": scenario.input_message,
            "expected_behavior": scenario.expected_behavior,
            "timeout_seconds": scenario.timeout_seconds,
        },
        "result": _build_result_summary(result),
        "exception": _build_exception_summary(error),
    }
    (artifact_dir / "summary.json").write_text(
        json.dumps(summary_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    if result is not None:
        (artifact_dir / "artifacts.json").write_text(
            json.dumps(
                result.artifacts.to_judge_payload(), ensure_ascii=False, indent=2
            )
            + "\n",
            encoding="utf-8",
        )
        if result.judge is not None:
            judge_payload = {
                "pass": result.judge.passed,
                "summary": result.judge.summary,
                "reasons": result.judge.reasons,
                "evidence": result.judge.evidence,
            }
            (artifact_dir / "judge.json").write_text(
                json.dumps(judge_payload, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            (artifact_dir / "judge.txt").write_text(
                result.judge.raw_response,
                encoding="utf-8",
            )

    if error is not None:
        traceback_text = "".join(
            traceback.format_exception(type(error), error, error.__traceback__)
        )
        (artifact_dir / "exception.txt").write_text(
            traceback_text,
            encoding="utf-8",
        )

    _copy_workspace_snapshot(workspace_dir=workspace_dir, artifact_dir=artifact_dir)
    _copy_logs_snapshot(workspace_dir=workspace_dir, artifact_dir=artifact_dir)
    return artifact_dir


def _wait_for_quiescence(
    *,
    client: TestClient,
    assistant_id: str,
    initial_history_length: int,
    timeout_seconds: float,
) -> bool:
    deadline = time.monotonic() + timeout_seconds
    observed_progress = False
    stable_polls = 0
    while time.monotonic() < deadline:
        assistant_detail = client.get(f"/api/nodes/{assistant_id}").json()
        nodes = client.get("/api/nodes").json()["nodes"]
        observed_progress = observed_progress or (
            len(assistant_detail["history"]) > initial_history_length
        )
        all_quiescent = observed_progress and all(
            node["state"] in {"idle", "error", "terminated"} for node in nodes
        )
        if all_quiescent:
            stable_polls += 1
            if stable_polls >= 2:
                return True
        else:
            stable_polls = 0
        time.sleep(0.5)
    return False


def _collect_artifacts(
    *,
    client: TestClient,
    assistant_id: str,
    timed_out: bool,
) -> EvalArtifacts:
    assistant_detail = client.get(f"/api/nodes/{assistant_id}").json()
    nodes = client.get("/api/nodes").json()["nodes"]
    formations = client.get("/api/formations").json()["formations"]
    node_details = [client.get(f"/api/nodes/{node['id']}").json() for node in nodes]
    formation_details = [
        client.get(f"/api/formations/{formation['id']}").json()
        for formation in formations
    ]
    return EvalArtifacts(
        assistant_id=assistant_id,
        assistant_state=assistant_detail["state"],
        final_reply=extract_final_assistant_text(assistant_detail["history"]),
        timed_out=timed_out,
        nodes=nodes,
        node_details=node_details,
        formations=formations,
        formation_details=formation_details,
    )


def _detect_infrastructure_failure(artifacts: EvalArtifacts) -> str | None:
    if artifacts.timed_out:
        return "scenario timed out before the system became quiescent"
    if artifacts.assistant_state == "error":
        return "assistant entered error state"
    for node in artifacts.nodes:
        if node["state"] == "error":
            return f"node {node['id']} entered error state"
    if artifacts.final_reply is None:
        return "assistant did not produce a final human-facing reply"
    return None


def _allocate_artifact_dir_name(scenario_name: str) -> str:
    timestamp = time.time_ns() // 1_000_000
    prefix = datetime.fromtimestamp(timestamp / 1000).strftime("%Y-%m-%d_%H%M%S")
    normalized_name = "".join(
        ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in scenario_name.strip()
    ).strip("-")
    if not normalized_name:
        normalized_name = "scenario"
    return f"{prefix}_{timestamp}_{normalized_name}"


def _build_result_summary(result: EvalRunResult | None) -> dict[str, Any] | None:
    if result is None:
        return None
    judge_summary: dict[str, Any] | None
    if result.judge is None:
        judge_summary = None
    else:
        judge_summary = {
            "pass": result.judge.passed,
            "summary": result.judge.summary,
            "reasons": result.judge.reasons,
            "evidence": result.judge.evidence,
        }
    return {
        "passed": result.passed,
        "failure": result.failure,
        "assistant_state": result.artifacts.assistant_state,
        "timed_out": result.artifacts.timed_out,
        "final_reply": result.artifacts.final_reply,
        "node_count": len(result.artifacts.nodes),
        "formation_count": len(result.artifacts.formations),
        "judge": judge_summary,
    }


def _build_exception_summary(error: BaseException | None) -> dict[str, str] | None:
    if error is None:
        return None
    return {
        "type": type(error).__name__,
        "message": str(error),
    }


def _copy_workspace_snapshot(*, workspace_dir: Path, artifact_dir: Path) -> None:
    if not workspace_dir.exists():
        return
    snapshot_dir = artifact_dir / "workspace"
    shutil.copytree(
        workspace_dir,
        snapshot_dir,
        ignore=shutil.ignore_patterns("logs"),
    )
    settings_path = snapshot_dir / "runtime-settings.json"
    if settings_path.exists():
        settings_path.write_text(
            json.dumps(
                _masked_settings_payload(settings_path), ensure_ascii=False, indent=2
            )
            + "\n",
            encoding="utf-8",
        )


def _copy_logs_snapshot(*, workspace_dir: Path, artifact_dir: Path) -> None:
    logs_dir = workspace_dir / "logs"
    if not logs_dir.is_dir():
        return
    shutil.copytree(logs_dir, artifact_dir / "logs")


def _masked_settings_payload(settings_path: Path) -> dict[str, Any]:
    payload = json.loads(settings_path.read_text(encoding="utf-8"))
    return _mask_secrets(payload)


def _mask_secrets(value: Any, *, key: str | None = None) -> Any:
    if isinstance(value, dict):
        return {k: _mask_secrets(v, key=k) for k, v in value.items()}
    if isinstance(value, list):
        return [_mask_secrets(item) for item in value]
    if key in {"api_key", "bot_token"} and isinstance(value, str):
        return mask_secret(value)
    return value


def _judge_scenario(
    *,
    scenario: EvalScenario,
    artifacts: EvalArtifacts,
) -> EvalJudgeResult:
    judge_request = {
        "scenario": scenario.name,
        "input_message": scenario.input_message,
        "expected_behavior": scenario.expected_behavior,
        "artifacts": artifacts.to_judge_payload(),
    }
    response = gateway.chat(
        messages=[
            {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(judge_request, ensure_ascii=False, indent=2),
            },
        ]
    )
    raw_response = (response.content or "").strip()
    if not raw_response:
        raise ValueError("judge returned empty content")
    return parse_judge_response(raw_response)


def _extract_json_payload(raw_response: str) -> str:
    text = raw_response.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    if text.startswith("{") and text.endswith("}"):
        return text
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("judge response does not contain a JSON object")
    return text[start : end + 1]


def _validate_llm_eval_configuration() -> None:
    settings = get_settings()
    provider_id = settings.model.active_provider_id.strip()
    model = settings.model.active_model.strip()
    if not provider_id:
        raise RuntimeError("LLM evals require settings.model.active_provider_id")
    if not model:
        raise RuntimeError("LLM evals require settings.model.active_model")
    provider = find_provider(settings, provider_id)
    if provider is None:
        raise RuntimeError(f"LLM eval provider '{provider_id}' not found")
