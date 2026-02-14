import pytest
from fastapi.testclient import TestClient


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
    response = client.get("/api/agents")

    assert response.status_code == 200
    data = response.json()
    assert "agents" in data
    assert isinstance(data["agents"], list)
    assert len(data["agents"]) >= 1

    steward = next((a for a in data["agents"] if a["role"] == "steward"), None)
    assert steward is not None
    assert "id" in steward
    assert "state" in steward


def test_get_agent_not_found(client: TestClient):
    response = client.get("/api/agents/non-existent-id")

    assert response.status_code == 404
    assert "Agent not found" in response.json()["detail"]
