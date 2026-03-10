import json

from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.tools.edit import EditTool


def test_edit_tool_applies_multiple_edits_in_sequence(tmp_path):
    target = tmp_path / "sample.txt"
    target.write_text("alpha\nbeta\ngamma\n", encoding="utf-8")
    agent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            tools=["edit"],
            write_dirs=[str(tmp_path)],
        )
    )

    result = json.loads(
        EditTool().execute(
            agent,
            {
                "path": str(target),
                "edits": [
                    {
                        "start_line": 2,
                        "end_line": 2,
                        "new_content": "beta-1\nbeta-2\n",
                    },
                    {
                        "start_line": 4,
                        "end_line": 4,
                        "new_content": "gamma-updated\n",
                    },
                ],
            },
        )
    )

    assert result["status"] == "edited"
    assert (
        target.read_text(encoding="utf-8") == "alpha\nbeta-1\nbeta-2\ngamma-updated\n"
    )


def test_edit_tool_creates_missing_file_with_edits(tmp_path):
    target = tmp_path / "new.txt"
    agent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            tools=["edit"],
            write_dirs=[str(tmp_path)],
        )
    )

    result = json.loads(
        EditTool().execute(
            agent,
            {
                "path": str(target),
                "edits": [
                    {
                        "start_line": 1,
                        "end_line": 1,
                        "new_content": "hello\nworld\n",
                    }
                ],
            },
        )
    )

    assert result["status"] == "edited"
    assert target.read_text(encoding="utf-8") == "hello\nworld\n"
