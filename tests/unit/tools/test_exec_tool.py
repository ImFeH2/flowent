import json

from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.tools.exec import ExecTool


def test_exec_tool_runs_in_current_workspace_when_tmp_is_sandboxed(
    monkeypatch,
    tmp_path,
):
    target = tmp_path / "settings.json"
    target.write_text('{"name": "demo"}\n', encoding="utf-8")
    monkeypatch.chdir(tmp_path)

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
