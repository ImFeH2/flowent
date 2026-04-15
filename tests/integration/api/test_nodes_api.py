import os
from uuid import UUID

from fastapi.testclient import TestClient

from app.models import AgentState, AssistantText, ReceivedMessage
from app.registry import registry
from app.routes.nodes import router as nodes_router
from app.settings import STEWARD_ROLE_INCLUDED_TOOLS
from app.tools import MINIMUM_TOOLS


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
    assert isinstance(data["contacts"], list)
    assert isinstance(data["history"], list)
    assert isinstance(data["tools"], list)
    assert isinstance(data["write_dirs"], list)
    assert isinstance(data["allow_network"], bool)


def test_worker_and_leader_are_stable_contacts_without_explicit_edge(
    client: TestClient,
):
    tab = client.post(
        "/api/tabs",
        json={"title": "Execution", "goal": "Coordinate work"},
    ).json()
    worker = client.post(
        f"/api/tabs/{tab['id']}/nodes",
        json={"role_name": "Worker", "name": "Worker"},
    ).json()

    detail_without_edge = client.get(f"/api/nodes/{worker['id']}")

    assert detail_without_edge.status_code == 200
    assert detail_without_edge.json()["contacts"] == [tab["leader_id"]]
    leader_without_edge = client.get(f"/api/nodes/{tab['leader_id']}")
    assert leader_without_edge.status_code == 200
    assert worker["id"] in leader_without_edge.json()["contacts"]

    edge_response = client.post(
        f"/api/tabs/{tab['id']}/edges",
        json={
            "from_node_id": tab["leader_id"],
            "to_node_id": worker["id"],
        },
    )

    assert edge_response.status_code == 400
    assert edge_response.json()["detail"] == (
        "Leader does not participate in Agent Network edges"
    )


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
    assert nodes[0]["name"] == "Assistant"
    assert nodes[0]["role_name"] == "Steward"


def test_get_assistant_detail_includes_tools_and_permissions(client: TestClient):
    assistant_id = _get_assistant_id(client)
    response = client.get(f"/api/nodes/{assistant_id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == assistant_id
    assert set(data["tools"]) == set(MINIMUM_TOOLS) | set(STEWARD_ROLE_INCLUDED_TOOLS)
    assert data["write_dirs"] == [os.getcwd()]
    assert data["allow_network"] is True


def test_get_node_detail_includes_state_entries_in_history(client: TestClient):
    assistant_id = _get_assistant_id(client)
    assistant = registry.get(assistant_id)
    assert assistant is not None
    assistant.set_state(AgentState.RUNNING, "processing")

    response = client.get(f"/api/nodes/{assistant_id}")

    assert response.status_code == 200
    history = response.json()["history"]
    assert any(
        entry["type"] == "StateEntry" and entry["state"] == "running"
        for entry in history
    )


def test_assistant_cannot_be_terminated_via_nodes_api(client: TestClient):
    assistant_id = _get_assistant_id(client)
    response = client.post(f"/api/nodes/{assistant_id}/terminate")

    assert response.status_code == 400
    assert response.json() == {"detail": "Cannot terminate assistant"}


def test_tab_leader_cannot_be_terminated_directly(client: TestClient):
    created_tab = client.post(
        "/api/tabs",
        json={"title": "Execution", "goal": "Coordinate work"},
    ).json()

    response = client.post(f"/api/nodes/{created_tab['leader_id']}/terminate")

    assert response.status_code == 400
    assert response.json() == {"detail": "Cannot terminate a tab Leader directly"}


def test_assistant_can_be_interrupted_via_nodes_api_when_running(client: TestClient):
    assistant_id = _get_assistant_id(client)
    assistant = registry.get(assistant_id)
    assert assistant is not None
    assistant.set_state(AgentState.RUNNING, "processing")

    response = client.post(f"/api/nodes/{assistant_id}/interrupt")

    assert response.status_code == 200
    assert response.json() == {"status": "interrupting"}
    assert assistant._interrupt_requested.is_set()


def test_assistant_can_be_interrupted_via_nodes_api_when_sleeping(client: TestClient):
    assistant_id = _get_assistant_id(client)
    assistant = registry.get(assistant_id)
    assert assistant is not None
    assistant.set_state(AgentState.SLEEPING, "waiting for reply")

    response = client.post(f"/api/nodes/{assistant_id}/interrupt")

    assert response.status_code == 200
    assert response.json() == {"status": "interrupting"}
    assert assistant._interrupt_requested.is_set()


def test_interrupt_ignores_idle_node(client: TestClient):
    assistant_id = _get_assistant_id(client)
    response = client.post(f"/api/nodes/{assistant_id}/interrupt")

    assert response.status_code == 200
    assert response.json() == {"status": "ignored"}


def test_assistant_chat_can_be_cleared_via_nodes_api(client: TestClient):
    assistant_id = _get_assistant_id(client)
    assistant = registry.get(assistant_id)
    assert assistant is not None
    assistant.history.append(ReceivedMessage(content="Old message", from_id="human"))
    assistant.history.append(AssistantText(content="Old reply"))

    response = client.post(f"/api/nodes/{assistant_id}/clear-chat")

    assert response.status_code == 200
    assert response.json() == {"status": "cleared"}

    detail = client.get(f"/api/nodes/{assistant_id}").json()
    assert not any(
        entry["type"] in {"ReceivedMessage", "AssistantText"}
        for entry in detail["history"]
    )
