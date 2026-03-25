from __future__ import annotations

import json
import shutil
import tempfile
from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.evals import EvalRunResult, EvalScenario, persist_eval_result


def _artifact_suffix(path: Path | None) -> str:
    if path is None:
        return ""
    return f"\nArtifacts: {path}"


@pytest.fixture
def llm_eval_artifacts_root(request: pytest.FixtureRequest) -> Path:
    root = Path(request.config.rootpath)
    artifacts_root = root / request.config.getoption("--llm-eval-artifacts-dir")
    artifacts_root.mkdir(parents=True, exist_ok=True)
    return artifacts_root


@pytest.fixture
def llm_eval_save_mode(request: pytest.FixtureRequest) -> str:
    return str(request.config.getoption("--llm-eval-save"))


@pytest.fixture
def llm_eval_workspace(monkeypatch):
    import app.settings as settings_module

    project_root = Path.cwd().resolve()
    workspace_root = project_root / ".pytest-llm-eval-workspaces"
    workspace_root.mkdir(exist_ok=True)
    workspace = Path(
        tempfile.mkdtemp(prefix="workspace-", dir=str(workspace_root))
    ).resolve()

    current_settings = settings_module.get_settings()
    settings_payload = settings_module.serialize_settings(
        current_settings,
        mask_telegram_token=False,
    )
    settings_payload["telegram"] = {
        "bot_token": "",
        "pending_chats": [],
        "approved_chats": [],
    }

    settings_file = workspace / "runtime-settings.json"
    settings_file.write_text(
        json.dumps(settings_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    monkeypatch.chdir(workspace)
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    yield workspace

    monkeypatch.setattr(settings_module, "_cached_settings", None)
    shutil.rmtree(workspace, ignore_errors=True)


@pytest.fixture
def make_llm_eval_client(
    llm_eval_workspace: Path,
) -> Iterator[Callable[[], AbstractContextManager[TestClient]]]:
    from app.config import Config
    from app.logging import setup_logging
    from app.main import app
    from app.providers.gateway import gateway

    @contextmanager
    def _make_client() -> Iterator[TestClient]:
        setup_logging(Config(), runtime_dir=llm_eval_workspace)
        gateway.invalidate_cache()
        with TestClient(app) as client:
            yield client
        gateway.invalidate_cache()

    yield _make_client


@pytest.fixture
def run_llm_eval_scenario(
    llm_eval_workspace: Path,
    llm_eval_artifacts_root: Path,
    llm_eval_save_mode: str,
    make_llm_eval_client: Callable[[], AbstractContextManager[TestClient]],
) -> Iterator[Callable[[EvalScenario], tuple[EvalRunResult, Path | None]]]:
    from app.evals import evaluate_scenario

    def _run(scenario: EvalScenario) -> tuple[EvalRunResult, Path | None]:
        if scenario.setup_workspace is not None:
            scenario.setup_workspace(llm_eval_workspace)

        result: EvalRunResult | None = None
        try:
            with make_llm_eval_client() as client:
                result = evaluate_scenario(client, scenario)
        except BaseException as exc:
            artifact_dir = persist_eval_result(
                output_root=llm_eval_artifacts_root,
                workspace_dir=llm_eval_workspace,
                scenario=scenario,
                result=result,
                save_mode=llm_eval_save_mode,
                error=exc,
            )
            if artifact_dir is not None:
                exc.add_note(f"LLM eval artifacts saved to {artifact_dir}")
            raise

        artifact_dir = persist_eval_result(
            output_root=llm_eval_artifacts_root,
            workspace_dir=llm_eval_workspace,
            scenario=scenario,
            result=result,
            save_mode=llm_eval_save_mode,
        )
        return result, artifact_dir

    yield _run


@pytest.fixture
def format_llm_eval_failure() -> Iterator[Callable[[str, Path | None], str]]:
    def _format(message: str, artifact_dir: Path | None) -> str:
        return f"{message}{_artifact_suffix(artifact_dir)}"

    yield _format
