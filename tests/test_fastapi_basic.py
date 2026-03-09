import pytest
from fastapi.testclient import TestClient

from app.routes.nodes import router as nodes_router


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as client:
        yield client


def test_health_check(client: TestClient):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_list_agents(client: TestClient):
    response = client.get("/api/nodes")

    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert isinstance(data["nodes"], list)


def test_get_agent_not_found(client: TestClient):
    response = client.get("/api/nodes/non-existent-id")

    assert response.status_code == 404
    assert "Node not found" in response.json()["detail"]


def test_direct_node_message_api_is_not_available(client: TestClient):
    assert not any(
        getattr(route, "path", None) == "/api/nodes/{node_id}/message"
        for route in nodes_router.routes
    )
