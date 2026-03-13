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


def test_get_node_detail_includes_runtime_config(client: TestClient):
    response = client.get("/api/nodes/steward")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "steward"
    assert isinstance(data["history"], list)
    assert isinstance(data["tools"], list)
    assert isinstance(data["write_dirs"], list)
    assert isinstance(data["allow_network"], bool)


def test_direct_node_message_api_is_not_available(client: TestClient):
    assert not any(
        getattr(route, "path", None) == "/api/nodes/{node_id}/message"
        for route in nodes_router.routes
    )


def test_only_steward_node_exists_at_startup(client: TestClient):
    list_response = client.get("/api/nodes")

    assert list_response.status_code == 200
    nodes = list_response.json()["nodes"]
    assert len(nodes) == 1
    assert nodes[0]["id"] == "steward"
    assert nodes[0]["node_type"] == "steward"
    assert nodes[0]["name"] == "Assistant"
    assert nodes[0]["role_name"] == "Steward"


def test_get_steward_detail_includes_tools_and_permissions(client: TestClient):
    response = client.get("/api/nodes/steward")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "steward"
    assert data["tools"] == [
        "create_root",
        "manage_providers",
        "manage_roles",
        "manage_settings",
        "manage_prompts",
    ]
    assert data["write_dirs"] == []
    assert data["allow_network"] is True


def test_steward_cannot_be_terminated_via_nodes_api(client: TestClient):
    response = client.post("/api/nodes/steward/terminate")

    assert response.status_code == 400
    assert response.json() == {"detail": "Cannot terminate assistant"}
