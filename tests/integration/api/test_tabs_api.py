from fastapi.testclient import TestClient


def test_list_tabs_is_empty_at_startup(client: TestClient):
    response = client.get("/api/tabs")

    assert response.status_code == 200
    assert response.json() == {"tabs": []}


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

    reader_response = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Worker", "name": "Reader"},
    )
    writer_response = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Worker", "name": "Writer"},
    )

    assert reader_response.status_code == 200
    assert writer_response.status_code == 200
    reader = reader_response.json()
    writer = writer_response.json()
    assert reader["config"]["tab_id"] == tab_id
    assert writer["config"]["tab_id"] == tab_id

    edge_response = client.post(
        f"/api/tabs/{tab_id}/edges",
        json={
            "from_node_id": reader["id"],
            "to_node_id": writer["id"],
        },
    )

    assert edge_response.status_code == 200
    edge = edge_response.json()
    assert edge["tab_id"] == tab_id
    assert edge["from_node_id"] == reader["id"]
    assert edge["to_node_id"] == writer["id"]

    tab_detail_response = client.get(f"/api/tabs/{tab_id}")
    assert tab_detail_response.status_code == 200
    tab_detail = tab_detail_response.json()
    assert tab_detail["tab"]["id"] == tab_id
    assert {node["name"] for node in tab_detail["nodes"]} == {"Reader", "Writer"}
    assert tab_detail["edges"] == [edge]

    nodes_response = client.get("/api/nodes")
    assert nodes_response.status_code == 200
    nodes = nodes_response.json()["nodes"]
    reader_node = next(node for node in nodes if node["id"] == reader["id"])
    writer_node = next(node for node in nodes if node["id"] == writer["id"])
    assert reader_node["tab_id"] == tab_id
    assert writer_node["tab_id"] == tab_id
    assert reader_node["connections"] == [writer["id"]]


def test_delete_tab_cleans_up_nodes_and_edges(client: TestClient):
    create_tab_response = client.post(
        "/api/tabs",
        json={"title": "Disposable", "goal": "Delete me"},
    )

    assert create_tab_response.status_code == 200
    tab_id = create_tab_response.json()["id"]

    left_response = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Worker", "name": "Left"},
    )
    right_response = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Worker", "name": "Right"},
    )
    assert left_response.status_code == 200
    assert right_response.status_code == 200
    left_id = left_response.json()["id"]
    right_id = right_response.json()["id"]

    edge_response = client.post(
        f"/api/tabs/{tab_id}/edges",
        json={"from_node_id": left_id, "to_node_id": right_id},
    )
    assert edge_response.status_code == 200
    edge_id = edge_response.json()["id"]

    delete_response = client.delete(f"/api/tabs/{tab_id}")

    assert delete_response.status_code == 200
    assert delete_response.json()["id"] == tab_id
    assert set(delete_response.json()["removed_node_ids"]) == {left_id, right_id}
    assert delete_response.json()["removed_edge_ids"] == [edge_id]

    tab_detail_response = client.get(f"/api/tabs/{tab_id}")
    assert tab_detail_response.status_code == 404

    nodes_response = client.get("/api/nodes")
    assert nodes_response.status_code == 200
    node_ids = {node["id"] for node in nodes_response.json()["nodes"]}
    assert left_id not in node_ids
    assert right_id not in node_ids


def test_create_tab_rejects_second_conductor_owner(client: TestClient):
    create_tab_response = client.post(
        "/api/tabs",
        json={"title": "Execution", "goal": "Coordinate work"},
    )

    assert create_tab_response.status_code == 200
    tab_id = create_tab_response.json()["id"]

    first_conductor = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Conductor", "name": "Main Conductor"},
    )
    duplicate_conductor = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Conductor", "name": "Backup Conductor"},
    )

    assert first_conductor.status_code == 200
    assert duplicate_conductor.status_code == 400
    assert (
        duplicate_conductor.json()["detail"]
        == f"Tab '{tab_id}' already has a Conductor owner"
    )
