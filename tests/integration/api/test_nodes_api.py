from fastapi.testclient import TestClient

from app.routes.nodes import router as nodes_router


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


def test_conductor_node_is_a_regular_agent_and_can_be_terminated(client: TestClient):
    list_response = client.get("/api/nodes")

    assert list_response.status_code == 200
    nodes = {node["id"]: node for node in list_response.json()["nodes"]}
    assert nodes["conductor"]["node_type"] == "agent"
    assert nodes["conductor"]["role_name"] == "Conductor"

    terminate_response = client.post("/api/nodes/conductor/terminate")

    assert terminate_response.status_code == 200
    assert terminate_response.json() == {"status": "terminating"}


def test_steward_cannot_be_terminated_via_nodes_api(client: TestClient):
    response = client.post("/api/nodes/steward/terminate")

    assert response.status_code == 400
    assert response.json() == {"detail": "Cannot terminate steward"}
