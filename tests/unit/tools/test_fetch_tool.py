import json

from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.tools.fetch import FetchTool


class _FakeResponse:
    def __init__(self, status_code: int, chunks: list[str]):
        self.status_code = status_code
        self._chunks = chunks

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def iter_content(self):
        for chunk in self._chunks:
            yield chunk.encode()


class _FakeClient:
    def __init__(self, *, timeout: float):
        self.timeout = timeout

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def stream(self, method, url, headers=None, data=None):
        assert method == "GET"
        assert url == "https://example.com/data"
        assert headers is None
        assert data is None
        return _FakeResponse(200, ["hello ", "world"])


def test_fetch_tool_streams_response_body_chunks(monkeypatch):
    agent = Agent(
        NodeConfig(node_type=NodeType.AGENT, tools=["fetch"], allow_network=True)
    )
    chunks: list[str] = []

    monkeypatch.setattr("app.tools.fetch.create_http_session", _FakeClient)

    result = json.loads(
        FetchTool().execute(
            agent,
            {"method": "GET", "url": "https://example.com/data"},
            on_output=chunks.append,
        )
    )

    assert result == {"status_code": 200, "body": "hello world"}
    assert "".join(chunks) == "GET https://example.com/data\nHTTP 200\n\nhello world"
