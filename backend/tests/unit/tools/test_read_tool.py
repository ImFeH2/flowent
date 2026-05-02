import json

from flowent.agent import Agent
from flowent.models import NodeConfig, NodeType
from flowent.tools.read import ReadTool


def test_read_tool_prefixes_each_line_with_cat_n_style_line_numbers(tmp_path):
    target = tmp_path / "sample.txt"
    target.write_text("alpha\nbeta\n", encoding="utf-8")
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["read"]))

    result = json.loads(ReadTool().execute(agent, {"path": str(target)}))

    assert result["content"] == "     1\talpha\n     2\tbeta\n"


def test_read_tool_streams_numbered_content_chunks(tmp_path):
    target = tmp_path / "sample.txt"
    target.write_text("alpha\nbeta\ngamma\n", encoding="utf-8")
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["read"]))
    chunks: list[str] = []

    result = json.loads(
        ReadTool().execute(
            agent,
            {"path": str(target), "start_line": 2, "end_line": 3},
            on_output=chunks.append,
        )
    )

    assert result["content"] == "     2\tbeta\n     3\tgamma\n"
    assert "".join(chunks) == result["content"]
