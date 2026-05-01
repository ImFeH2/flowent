import json
import shutil
import subprocess

import pytest

from flowent_api.agent import Agent
from flowent_api.models import NodeConfig, NodeType
from flowent_api.settings import Settings
from flowent_api.tools.exec import ExecTool


def _sandbox_exec_supported(tmp_path) -> bool:
    if shutil.which("bwrap") is None:
        return False

    probe = subprocess.run(
        [
            "bwrap",
            "--ro-bind",
            "/",
            "/",
            "--dev",
            "/dev",
            "--proc",
            "/proc",
            "--tmpfs",
            "/tmp",
            "--ro-bind",
            str(tmp_path),
            str(tmp_path),
            "--chdir",
            str(tmp_path),
            "--die-with-parent",
            "--new-session",
            "--",
            "bash",
            "-c",
            "pwd >/dev/null",
        ],
        capture_output=True,
        text=True,
    )
    return probe.returncode == 0


def test_exec_tool_runs_in_working_dir_when_tmp_is_sandboxed(
    monkeypatch,
    tmp_path,
):
    if not _sandbox_exec_supported(tmp_path):
        pytest.skip("bwrap sandbox is unavailable in this environment")

    target = tmp_path / "settings.json"
    target.write_text('{"name": "demo"}\n', encoding="utf-8")
    monkeypatch.setattr(
        "flowent_api.settings.get_settings",
        lambda: Settings(working_dir=str(tmp_path)),
    )

    agent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            tools=["exec"],
            write_dirs=[],
        )
    )

    result = json.loads(
        ExecTool().execute(
            agent,
            {
                "command": "pwd; cat settings.json",
                "timeout": 30,
            },
        )
    )

    assert result["returncode"] == 0
    assert result["stdout"] == f"{tmp_path}\n" + '{"name": "demo"}\n'
    assert result["stderr"] == ""
