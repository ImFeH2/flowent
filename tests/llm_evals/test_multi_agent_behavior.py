from __future__ import annotations

from pathlib import Path

import pytest

from app.evals import EvalScenario


def _write_parallel_workspace(workspace: Path) -> None:
    (workspace / "README.md").write_text("# Demo Workspace\n", encoding="utf-8")
    (workspace / "notes.txt").write_text("alpha\nbeta\n", encoding="utf-8")
    (workspace / "app").mkdir()
    (workspace / "app" / "placeholder.py").write_text(
        "value = 1\n",
        encoding="utf-8",
    )


def _write_project_intro_workspace(workspace: Path) -> None:
    (workspace / "README.md").write_text(
        "# Demo Project\n\nA small demo project.\n",
        encoding="utf-8",
    )
    (workspace / "src").mkdir()
    (workspace / "src" / "main.py").write_text(
        "def main():\n    return 'demo'\n",
        encoding="utf-8",
    )
    (workspace / "tests").mkdir()
    (workspace / "tests" / "test_main.py").write_text(
        "def test_placeholder():\n    assert True\n",
        encoding="utf-8",
    )
    (workspace / "pyproject.toml").write_text(
        "[project]\n"
        'name = "demo-project"\n'
        'version = "0.1.0"\n'
        'requires-python = ">=3.12"\n'
        'dependencies = ["fastapi>=0.116", "httpx>=0.28"]\n'
        "\n"
        "[build-system]\n"
        'requires = ["hatchling"]\n'
        'build-backend = "hatchling.build"\n',
        encoding="utf-8",
    )


def _write_simple_file_count_workspace(workspace: Path) -> None:
    (workspace / "app").mkdir()
    (workspace / "app" / "settings.py").write_text(
        "VALUE = 1\nENABLED = True\nTIMEOUT = 30\nNAME = 'demo'\nMODE = 'test'\n",
        encoding="utf-8",
    )


SCENARIOS = [
    EvalScenario(
        name="parallel_two_workers",
        input_message="同时帮我做两件事: 1. 查看当前目录有哪些文件 2. 查看当前 Python 版本",
        expected_behavior=(
            "Assistant should use declarative creation for a Formation with two "
            "Workers, dispatch two different concrete tasks in the same turn, avoid "
            "inserting tool calls between those dispatches, and finally return a "
            "combined Human-facing reply that includes both the workspace file list "
            "and a Python version string."
        ),
        timeout_seconds=120.0,
        setup_workspace=_write_parallel_workspace,
    ),
    EvalScenario(
        name="fan_out_fan_in_project_intro",
        input_message=(
            "我需要了解这个项目. 请让一个 Agent 查看项目根目录的文件列表, "
            "另一个 Agent 查看 pyproject.toml 的内容, 然后让第三个 Agent 把两个结果汇总成一段项目简介."
        ),
        expected_behavior=(
            "Assistant should create a three-node fan-out-fan-in structure with two "
            "workers and one synthesizer-style node. The two upstream nodes should "
            "receive different tasks, the synthesis node should be instructed to "
            "wait for two inputs, and the final Human-facing project intro should "
            "mention demo-project, Python >=3.12, fastapi/httpx, and the presence "
            "of src and tests directories."
        ),
        timeout_seconds=150.0,
        setup_workspace=_write_project_intro_workspace,
    ),
    EvalScenario(
        name="single_node_simple_file_count",
        input_message="帮我看一下 app/settings.py 这个文件有多少行",
        expected_behavior=(
            "Assistant should treat this as a real execution task, create a simple "
            "single-node Formation, delegate the work, and return a final "
            "Human-facing reply that includes app/settings.py and the correct line "
            "count of 5."
        ),
        timeout_seconds=90.0,
        setup_workspace=_write_simple_file_count_workspace,
    ),
]


@pytest.mark.llm_eval
@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda scenario: scenario.name)
def test_multi_agent_behavior_llm_eval(
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
