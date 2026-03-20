from uuid import UUID

from fastapi.testclient import TestClient

from app.routes.nodes import router as nodes_router


def _get_assistant_id(client: TestClient) -> str:
    response = client.get("/api/assistant")

    assert response.status_code == 200
    assistant_id = response.json()["id"]
    UUID(assistant_id)
    return assistant_id


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
    assistant_id = _get_assistant_id(client)
    response = client.get(f"/api/nodes/{assistant_id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == assistant_id
    assert data["graph_id"] is None
    assert isinstance(data["history"], list)
    assert isinstance(data["tools"], list)
    assert isinstance(data["write_dirs"], list)
    assert isinstance(data["allow_network"], bool)
    assert data["graph"] is None


def test_direct_node_message_api_is_not_available(client: TestClient):
    assert not any(
        getattr(route, "path", None) == "/api/nodes/{node_id}/message"
        for route in nodes_router.routes
    )


def test_only_assistant_node_exists_at_startup(client: TestClient):
    list_response = client.get("/api/nodes")

    assert list_response.status_code == 200
    nodes = list_response.json()["nodes"]
    assert len(nodes) == 1
    UUID(nodes[0]["id"])
    assert nodes[0]["node_type"] == "assistant"
    assert nodes[0]["graph_id"] is None
    assert nodes[0]["name"] == "Assistant"
    assert nodes[0]["role_name"] == "Steward"


def test_get_assistant_detail_includes_tools_and_permissions(client: TestClient):
    assistant_id = _get_assistant_id(client)
    response = client.get(f"/api/nodes/{assistant_id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == assistant_id
    assert set(data["tools"]) == {
        "idle",
        "sleep",
        "todo",
        "list_connections",
        "create_graph",
        "spawn",
        "manage_providers",
        "manage_roles",
        "manage_settings",
        "manage_prompts",
    }
    assert data["write_dirs"] == []
    assert data["allow_network"] is True


def test_assistant_cannot_be_terminated_via_nodes_api(client: TestClient):
    assistant_id = _get_assistant_id(client)
    response = client.post(f"/api/nodes/{assistant_id}/terminate")

    assert response.status_code == 400
    assert response.json() == {"detail": "Cannot terminate assistant"}
