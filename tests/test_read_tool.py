import json

from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.tools.read import ReadTool


def test_read_tool_prefixes_each_line_with_cat_n_style_line_numbers(tmp_path):
    target = tmp_path / "sample.txt"
    target.write_text("alpha\nbeta\n", encoding="utf-8")
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["read"]))

    result = json.loads(ReadTool().execute(agent, {"path": str(target)}))

    assert result["content"] == "     1\talpha\n     2\tbeta\n"
