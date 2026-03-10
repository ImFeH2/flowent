import json

from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.sandbox import build_firejail_cmd
from app.tools.edit import EditTool


def test_edit_tool_rejects_all_writes_when_write_dirs_empty(tmp_path):
    agent = Agent(
        NodeConfig(node_type=NodeType.AGENT, tools=["edit"], write_dirs=[]),
    )
    target = tmp_path / "out.txt"

    result = json.loads(
        EditTool().execute(
            agent,
            {
                "path": str(target),
                "start_line": 1,
                "end_line": 1,
                "new_content": "hello\n",
            },
        )
    )

    assert result == {"error": "Write access is disabled for this agent"}
    assert not target.exists()


def test_build_firejail_cmd_keeps_tmp_read_only_when_write_dirs_empty():
    cmd = build_firejail_cmd([], "pwd", timeout_secs=30)

    assert "--read-only=/" in cmd
    assert "--read-write=/tmp" not in cmd
    assert not any(part.startswith("--read-write=") for part in cmd)


def test_build_firejail_cmd_enables_tmp_when_write_dirs_present(tmp_path):
    cmd = build_firejail_cmd([str(tmp_path)], "pwd", timeout_secs=30)

    assert f"--read-write={tmp_path}" in cmd
    assert "--read-write=/tmp" in cmd
