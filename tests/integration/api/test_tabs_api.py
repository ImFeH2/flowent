from copy import deepcopy
from typing import Any

from fastapi.testclient import TestClient


def _create_agent_node(
    client: TestClient,
    *,
    tab_id: str,
    name: str,
    role_name: str = "Worker",
) -> dict[str, Any]:
    response = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": role_name, "name": name},
    )
    assert response.status_code == 200
    return response.json()


def _create_graph_node(
    client: TestClient,
    *,
    tab_id: str,
    node_type: str,
    name: str,
    config: dict[str, object] | None = None,
) -> dict[str, Any]:
    response = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={
            "node_type": node_type,
            "name": name,
            "config": config or {},
        },
    )
    assert response.status_code == 200
    return response.json()


def test_list_tabs_is_empty_at_startup(client: TestClient):
    response = client.get("/api/tabs")

    assert response.status_code == 200
    assert response.json() == {"tabs": []}


def test_create_tab_rejects_removed_mcp_servers_field(client: TestClient):
    response = client.post(
        "/api/tabs",
        json={"title": "Review Task", "mcp_servers": ["filesystem"]},
    )

    assert response.status_code == 422


def test_create_tab_node_and_edge_round_trip(client: TestClient):
    create_tab_response = client.post(
        "/api/tabs",
        json={"title": "Review Task", "goal": "Inspect changed files"},
    )

    assert create_tab_response.status_code == 200
    tab = create_tab_response.json()
    tab_id = tab["id"]
    assert tab["title"] == "Review Task"
    assert tab["goal"] == "Inspect changed files"
    assert tab["node_count"] == 0
    assert tab["edge_count"] == 0
    assert tab["definition"] == {"version": 1, "nodes": [], "edges": []}
    assert isinstance(tab["leader_id"], str)

    reader = _create_agent_node(client, tab_id=tab_id, name="Reader")
    writer = _create_agent_node(client, tab_id=tab_id, name="Writer")

    assert reader["tab_id"] == tab_id
    assert writer["tab_id"] == tab_id
    assert reader["node_type"] == "agent"
    assert writer["node_type"] == "agent"
    assert reader["config"]["role_name"] == "Worker"
    assert writer["config"]["role_name"] == "Worker"

    edge_response = client.post(
        f"/api/tabs/{tab_id}/edges",
        json={
            "from_node_id": reader["id"],
            "from_port_key": "out",
            "to_node_id": writer["id"],
            "to_port_key": "in",
            "kind": "control",
        },
    )

    assert edge_response.status_code == 200
    edge = edge_response.json()
    assert edge["tab_id"] == tab_id
    assert edge["from_node_id"] == reader["id"]
    assert edge["from_port_key"] == "out"
    assert edge["to_node_id"] == writer["id"]
    assert edge["to_port_key"] == "in"
    assert edge["kind"] == "control"

    tab_detail_response = client.get(f"/api/tabs/{tab_id}")
    assert tab_detail_response.status_code == 200
    tab_detail = tab_detail_response.json()
    assert tab_detail["tab"]["id"] == tab_id
    assert tab_detail["tab"]["node_count"] == 2
    assert tab_detail["tab"]["edge_count"] == 1
    assert {node["name"] for node in tab_detail["nodes"]} == {"Reader", "Writer"}
    assert tab_detail["edges"] == [edge]
    assert len(tab_detail["tab"]["definition"]["nodes"]) == 2
    assert tab_detail["tab"]["definition"]["edges"] == [edge]

    nodes_response = client.get("/api/nodes")
    assert nodes_response.status_code == 200
    nodes = nodes_response.json()["nodes"]
    reader_node = next(node for node in nodes if node["id"] == reader["id"])
    writer_node = next(node for node in nodes if node["id"] == writer["id"])
    assert reader_node["tab_id"] == tab_id
    assert writer_node["tab_id"] == tab_id
    assert reader_node["connections"] == [writer["id"]]
    assert writer_node["connections"] == [reader["id"]]


def test_delete_tab_cleans_up_nodes_and_edges(client: TestClient):
    create_tab_response = client.post(
        "/api/tabs",
        json={"title": "Disposable", "goal": "Delete me"},
    )

    assert create_tab_response.status_code == 200
    created_tab = create_tab_response.json()
    tab_id = created_tab["id"]
    leader_id = created_tab["leader_id"]

    left = _create_agent_node(client, tab_id=tab_id, name="Left")
    right = _create_agent_node(client, tab_id=tab_id, name="Right")

    edge_response = client.post(
        f"/api/tabs/{tab_id}/edges",
        json={"from_node_id": left["id"], "to_node_id": right["id"]},
    )
    assert edge_response.status_code == 200
    edge_id = edge_response.json()["id"]

    delete_response = client.delete(f"/api/tabs/{tab_id}")

    assert delete_response.status_code == 200
    assert delete_response.json()["id"] == tab_id
    assert set(delete_response.json()["removed_node_ids"]) == {
        leader_id,
        left["id"],
        right["id"],
    }
    assert delete_response.json()["removed_edge_ids"] == [edge_id]

    tab_detail_response = client.get(f"/api/tabs/{tab_id}")
    assert tab_detail_response.status_code == 404

    nodes_response = client.get("/api/nodes")
    assert nodes_response.status_code == 200
    node_ids = {node["id"] for node in nodes_response.json()["nodes"]}
    assert left["id"] not in node_ids
    assert right["id"] not in node_ids


def test_delete_tab_edge_requires_exact_direction_and_removes_only_target_edge(
    client: TestClient,
):
    tab = client.post(
        "/api/tabs",
        json={"title": "Edge Delete", "goal": "Trim one connection"},
    ).json()
    tab_id = tab["id"]

    left = _create_agent_node(client, tab_id=tab_id, name="Left")
    middle = _create_agent_node(client, tab_id=tab_id, name="Middle")
    right = _create_agent_node(client, tab_id=tab_id, name="Right")

    left_to_middle = client.post(
        f"/api/tabs/{tab_id}/edges",
        json={"from_node_id": left["id"], "to_node_id": middle["id"]},
    )
    middle_to_right = client.post(
        f"/api/tabs/{tab_id}/edges",
        json={"from_node_id": middle["id"], "to_node_id": right["id"]},
    )

    assert left_to_middle.status_code == 200
    assert middle_to_right.status_code == 200

    reverse_delete_response = client.delete(
        f"/api/tabs/{tab_id}/edges",
        params={
            "from_node_id": middle["id"],
            "to_node_id": left["id"],
        },
    )
    assert reverse_delete_response.status_code == 404
    assert reverse_delete_response.json()["detail"] == "Edge not found"

    delete_response = client.delete(
        f"/api/tabs/{tab_id}/edges",
        params={
            "from_node_id": left["id"],
            "to_node_id": middle["id"],
        },
    )

    assert delete_response.status_code == 200
    assert delete_response.json()["from_node_id"] == left["id"]
    assert delete_response.json()["to_node_id"] == middle["id"]

    detail = client.get(f"/api/tabs/{tab_id}").json()
    remaining_edges = {
        (edge["from_node_id"], edge["to_node_id"]) for edge in detail["edges"]
    }
    assert remaining_edges == {(middle["id"], right["id"])}


def test_delete_tab_node_removes_node_and_all_incident_edges(client: TestClient):
    tab = client.post(
        "/api/tabs",
        json={"title": "Node Delete", "goal": "Remove one worker"},
    ).json()
    tab_id = tab["id"]

    left = _create_agent_node(client, tab_id=tab_id, name="Left")
    middle = _create_agent_node(client, tab_id=tab_id, name="Middle")
    right = _create_agent_node(client, tab_id=tab_id, name="Right")

    assert (
        client.post(
            f"/api/tabs/{tab_id}/edges",
            json={"from_node_id": left["id"], "to_node_id": middle["id"]},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/tabs/{tab_id}/edges",
            json={"from_node_id": middle["id"], "to_node_id": right["id"]},
        ).status_code
        == 200
    )

    delete_response = client.delete(f"/api/tabs/{tab_id}/nodes/{middle['id']}")

    assert delete_response.status_code == 200
    assert delete_response.json()["id"] == middle["id"]

    detail = client.get(f"/api/tabs/{tab_id}").json()
    remaining_nodes = {node["id"] for node in detail["nodes"]}
    assert middle["id"] not in remaining_nodes
    assert left["id"] in remaining_nodes
    assert right["id"] in remaining_nodes
    assert detail["edges"] == []


def test_tab_edge_creation_enforces_directed_ports_and_single_input(
    client: TestClient,
):
    tab = client.post(
        "/api/tabs",
        json={"title": "Edge Validation", "goal": "Enforce graph rules"},
    ).json()
    tab_id = tab["id"]
    worker = _create_agent_node(client, tab_id=tab_id, name="Worker")
    reviewer = _create_agent_node(client, tab_id=tab_id, name="Reviewer")
    observer = _create_agent_node(client, tab_id=tab_id, name="Observer")

    self_loop_response = client.post(
        f"/api/tabs/{tab_id}/edges",
        json={"from_node_id": worker["id"], "to_node_id": worker["id"]},
    )
    assert self_loop_response.status_code == 400
    assert self_loop_response.json()["detail"] == "Self-loop edges are not allowed"

    first_edge_response = client.post(
        f"/api/tabs/{tab_id}/edges",
        json={"from_node_id": worker["id"], "to_node_id": reviewer["id"]},
    )
    assert first_edge_response.status_code == 200

    duplicate_edge_response = client.post(
        f"/api/tabs/{tab_id}/edges",
        json={"from_node_id": worker["id"], "to_node_id": reviewer["id"]},
    )
    assert duplicate_edge_response.status_code == 400
    assert duplicate_edge_response.json()["detail"] == "Duplicate edges are not allowed"

    reverse_edge_response = client.post(
        f"/api/tabs/{tab_id}/edges",
        json={"from_node_id": reviewer["id"], "to_node_id": worker["id"]},
    )
    assert reverse_edge_response.status_code == 200

    conflicting_input_response = client.post(
        f"/api/tabs/{tab_id}/edges",
        json={"from_node_id": observer["id"], "to_node_id": reviewer["id"]},
    )
    assert conflicting_input_response.status_code == 400
    assert (
        conflicting_input_response.json()["detail"]
        == "Input port 'in' already has an incoming edge"
    )


def test_duplicate_tab_copies_definition_and_runtime_agents(client: TestClient):
    source_tab = client.post(
        "/api/tabs",
        json={"title": "Original Workflow", "goal": "Duplicate me"},
    ).json()
    source_tab_id = source_tab["id"]

    reviewer = _create_agent_node(client, tab_id=source_tab_id, name="Reviewer")
    formatter = _create_graph_node(
        client,
        tab_id=source_tab_id,
        node_type="code",
        name="Formatter",
        config={"language": "python"},
    )
    source_detail = client.get(f"/api/tabs/{source_tab_id}").json()
    source_definition = deepcopy(source_detail["tab"]["definition"])
    source_definition["view"] = {
        "positions": {
            reviewer["id"]: {"x": 20, "y": 40},
            formatter["id"]: {"x": 180, "y": 40},
        }
    }
    source_definition["edges"] = [
        {
            "id": "edge-review",
            "from_node_id": reviewer["id"],
            "from_port_key": "out",
            "to_node_id": formatter["id"],
            "to_port_key": "in",
            "kind": "control",
        }
    ]
    update_response = client.put(
        f"/api/tabs/{source_tab_id}/definition",
        json={"definition": source_definition},
    )
    assert update_response.status_code == 200

    duplicate_response = client.post(f"/api/tabs/{source_tab_id}/duplicate")

    assert duplicate_response.status_code == 200
    duplicated_tab = duplicate_response.json()
    assert duplicated_tab["title"] == "Original Workflow Copy"
    assert duplicated_tab["goal"] == "Duplicate me"
    assert duplicated_tab["node_count"] == 2
    assert duplicated_tab["edge_count"] == 1
    assert duplicated_tab["id"] != source_tab_id
    assert duplicated_tab["leader_id"] != source_tab["leader_id"]

    duplicated_detail = client.get(f"/api/tabs/{duplicated_tab['id']}").json()
    assert {node["name"] for node in duplicated_detail["nodes"]} == {
        "Reviewer",
        "Formatter",
    }
    duplicated_node_ids = {node["id"] for node in duplicated_detail["nodes"]}
    source_node_ids = {node["id"] for node in source_detail["nodes"]}
    assert duplicated_node_ids.isdisjoint(source_node_ids)
    assert duplicated_detail["edges"][0]["from_node_id"] in duplicated_node_ids
    assert duplicated_detail["edges"][0]["to_node_id"] in duplicated_node_ids
    assert duplicated_detail["tab"]["definition"]["view"]["positions"]


def test_update_tab_definition_updates_metadata_and_positions(client: TestClient):
    tab = client.post(
        "/api/tabs",
        json={"title": "JSON Editor", "goal": "Patch definition"},
    ).json()
    tab_id = tab["id"]

    agent_node = _create_agent_node(client, tab_id=tab_id, name="Draft Reviewer")
    code_node = _create_graph_node(
        client,
        tab_id=tab_id,
        node_type="code",
        name="Formatter",
    )

    current = client.get(f"/api/tabs/{tab_id}").json()["tab"]["definition"]
    definition = deepcopy(current)
    for node in definition["nodes"]:
        if node["id"] == agent_node["id"]:
            node["config"]["name"] = "Final Reviewer"
        if node["id"] == code_node["id"]:
            node["config"]["name"] = "Formatter"
            node["config"]["language"] = "python"
    definition["view"] = {
        "positions": {
            agent_node["id"]: {"x": 60, "y": 80},
            code_node["id"]: {"x": 260, "y": 80},
        }
    }
    definition["edges"] = [
        {
            "id": "edge-control",
            "from_node_id": agent_node["id"],
            "from_port_key": "out",
            "to_node_id": code_node["id"],
            "to_port_key": "in",
            "kind": "control",
        }
    ]

    update_response = client.put(
        f"/api/tabs/{tab_id}/definition",
        json={"definition": definition},
    )

    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["definition"]["view"]["positions"][agent_node["id"]] == {
        "x": 60.0,
        "y": 80.0,
    }
    assert updated["definition"]["edges"][0]["kind"] == "control"

    detail = client.get(f"/api/tabs/{tab_id}").json()
    reviewer_detail = next(
        node for node in detail["nodes"] if node["id"] == agent_node["id"]
    )
    formatter_detail = next(
        node for node in detail["nodes"] if node["id"] == code_node["id"]
    )
    assert reviewer_detail["name"] == "Final Reviewer"
    assert reviewer_detail["position"] == {"x": 60.0, "y": 80.0}
    assert formatter_detail["config"]["language"] == "python"
    assert formatter_detail["position"] == {"x": 260.0, "y": 80.0}

    runtime_node = client.get(f"/api/nodes/{agent_node['id']}")
    assert runtime_node.status_code == 200
    assert runtime_node.json()["name"] == "Final Reviewer"


def test_update_tab_definition_rejects_agent_set_changes(client: TestClient):
    tab = client.post(
        "/api/tabs",
        json={"title": "Guard Rails", "goal": "Reject invalid JSON"},
    ).json()
    tab_id = tab["id"]

    agent_node = _create_agent_node(client, tab_id=tab_id, name="Existing Worker")
    definition = deepcopy(client.get(f"/api/tabs/{tab_id}").json()["tab"]["definition"])
    definition["nodes"].append(
        {
            "id": "new-agent",
            "type": "agent",
            "config": {"role_name": "Worker", "name": "Injected Worker"},
            "inputs": [
                {
                    "key": "in",
                    "direction": "input",
                    "kind": "control",
                    "required": False,
                    "multiple": False,
                }
            ],
            "outputs": [
                {
                    "key": "out",
                    "direction": "output",
                    "kind": "control",
                    "required": False,
                    "multiple": True,
                }
            ],
        }
    )

    response = client.put(
        f"/api/tabs/{tab_id}/definition",
        json={"definition": definition},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Agent nodes must be created or deleted through workflow node APIs"
    )
    untouched = client.get(f"/api/nodes/{agent_node['id']}")
    assert untouched.status_code == 200
