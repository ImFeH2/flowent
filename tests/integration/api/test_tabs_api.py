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
    assert tab["node_count"] == 0
    assert tab["edge_count"] == 0
    assert isinstance(tab["leader_id"], str)

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
    assert {edge["from_node_id"], edge["to_node_id"]} == {
        reader["id"],
        writer["id"],
    }

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
    assert set(delete_response.json()["removed_node_ids"]) == {
        leader_id,
        left_id,
        right_id,
    }
    assert delete_response.json()["removed_edge_ids"] == [edge_id]

    tab_detail_response = client.get(f"/api/tabs/{tab_id}")
    assert tab_detail_response.status_code == 404

    nodes_response = client.get("/api/nodes")
    assert nodes_response.status_code == 200
    node_ids = {node["id"] for node in nodes_response.json()["nodes"]}
    assert left_id not in node_ids
    assert right_id not in node_ids


def test_delete_tab_edge_removes_only_the_target_edge(client: TestClient):
    tab = client.post(
        "/api/tabs",
        json={"title": "Edge Delete", "goal": "Trim one connection"},
    ).json()
    tab_id = tab["id"]

    left = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Worker", "name": "Left"},
    ).json()
    middle = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Worker", "name": "Middle"},
    ).json()
    right = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Worker", "name": "Right"},
    ).json()

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

    delete_response = client.delete(
        f"/api/tabs/{tab_id}/edges",
        params={
            "from_node_id": middle["id"],
            "to_node_id": left["id"],
        },
    )

    assert delete_response.status_code == 200
    assert {
        delete_response.json()["from_node_id"],
        delete_response.json()["to_node_id"],
    } == {left["id"], middle["id"]}

    detail = client.get(f"/api/tabs/{tab_id}").json()
    remaining_edges = {
        frozenset((edge["from_node_id"], edge["to_node_id"]))
        for edge in detail["edges"]
    }
    assert remaining_edges == {frozenset((middle["id"], right["id"]))}
    remaining_nodes = {node["id"] for node in detail["nodes"]}
    assert {left["id"], middle["id"], right["id"]}.issubset(remaining_nodes)


def test_delete_tab_node_removes_node_and_all_incident_edges(client: TestClient):
    tab = client.post(
        "/api/tabs",
        json={"title": "Node Delete", "goal": "Remove one worker"},
    ).json()
    tab_id = tab["id"]

    left = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Worker", "name": "Left"},
    ).json()
    middle = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Worker", "name": "Middle"},
    ).json()
    right = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Worker", "name": "Right"},
    ).json()

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


def test_tab_edge_creation_rejects_self_loops_and_duplicate_connections(
    client: TestClient,
):
    tab = client.post(
        "/api/tabs",
        json={"title": "Edge Validation", "goal": "Enforce graph rules"},
    ).json()
    tab_id = tab["id"]
    worker = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Worker", "name": "Worker"},
    ).json()
    reviewer = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Worker", "name": "Reviewer"},
    ).json()

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
    assert (
        duplicate_edge_response.json()["detail"]
        == "Duplicate connections are not allowed"
    )

    reverse_duplicate_edge_response = client.post(
        f"/api/tabs/{tab_id}/edges",
        json={"from_node_id": reviewer["id"], "to_node_id": worker["id"]},
    )
    assert reverse_duplicate_edge_response.status_code == 400
    assert (
        reverse_duplicate_edge_response.json()["detail"]
        == "Duplicate connections are not allowed"
    )

    delete_reverse_order_response = client.delete(
        f"/api/tabs/{tab_id}/edges",
        params={
            "from_node_id": reviewer["id"],
            "to_node_id": worker["id"],
        },
    )
    assert delete_reverse_order_response.status_code == 200
    assert {
        delete_reverse_order_response.json()["from_node_id"],
        delete_reverse_order_response.json()["to_node_id"],
    } == {worker["id"], reviewer["id"]}

    detail_response = client.get(f"/api/tabs/{tab_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["edges"] == []


def test_create_blueprint_rejects_reverse_duplicate_connections(client: TestClient):
    response = client.post(
        "/api/blueprints",
        json={
            "name": "Duplicate Connections",
            "description": "Should reject duplicate pairs",
            "slots": [
                {
                    "id": "slot-a",
                    "role_name": "Worker",
                    "display_name": "Agent A",
                },
                {
                    "id": "slot-b",
                    "role_name": "Designer",
                    "display_name": "Agent B",
                },
            ],
            "edges": [
                {"from_slot_id": "slot-a", "to_slot_id": "slot-b"},
                {"from_slot_id": "slot-b", "to_slot_id": "slot-a"},
            ],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Blueprint connection 'slot-a - slot-b' is duplicated"
    )


def test_create_tab_rejects_reserved_conductor_role_for_regular_nodes(
    client: TestClient,
):
    create_tab_response = client.post(
        "/api/tabs",
        json={"title": "Execution", "goal": "Coordinate work"},
    )

    assert create_tab_response.status_code == 200
    tab_id = create_tab_response.json()["id"]

    reserved_role_response = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Conductor", "name": "Main Conductor"},
    )

    assert reserved_role_response.status_code == 400
    assert reserved_role_response.json()["detail"] == (
        "Role 'Conductor' is reserved for a tab Leader"
    )


def test_create_tab_from_blueprint_materializes_network(client: TestClient):
    blueprint_response = client.post(
        "/api/blueprints",
        json={
            "name": "Review Pipeline",
            "description": "Reviewer collaborates with design",
            "slots": [
                {
                    "id": "slot-review",
                    "role_name": "Worker",
                    "display_name": "Primary Reviewer",
                },
                {
                    "id": "slot-design",
                    "role_name": "Designer",
                    "display_name": "UI Designer",
                },
            ],
            "edges": [
                {"from_slot_id": "slot-review", "to_slot_id": "slot-design"},
            ],
        },
    )

    assert blueprint_response.status_code == 200
    blueprint = blueprint_response.json()
    assert blueprint["node_count"] == 2
    assert blueprint["edge_count"] == 1

    create_tab_response = client.post(
        "/api/tabs",
        json={
            "title": "Blueprint Task",
            "goal": "Apply the saved network",
            "blueprint_id": blueprint["id"],
        },
    )

    assert create_tab_response.status_code == 200
    tab = create_tab_response.json()
    assert tab["node_count"] == 2
    assert tab["edge_count"] == 1
    assert tab["network_source"] == {
        "state": "blueprint-derived",
        "blueprint_id": blueprint["id"],
        "blueprint_name": "Review Pipeline",
        "blueprint_version": 1,
        "blueprint_available": True,
    }

    tab_detail_response = client.get(f"/api/tabs/{tab['id']}")

    assert tab_detail_response.status_code == 200
    tab_detail = tab_detail_response.json()
    assert tab_detail["tab"]["network_source"]["state"] == "blueprint-derived"
    assert {node["name"] for node in tab_detail["nodes"]} == {
        "Primary Reviewer",
        "UI Designer",
    }
    assert len(tab_detail["edges"]) == 1


def test_save_network_as_blueprint_and_mark_drifted_after_manual_change(
    client: TestClient,
):
    create_tab_response = client.post(
        "/api/tabs",
        json={"title": "Manual Network", "goal": "Build and reuse"},
    )
    assert create_tab_response.status_code == 200
    tab = create_tab_response.json()
    tab_id = tab["id"]

    reader_response = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Worker", "name": "Reader"},
    )
    writer_response = client.post(
        f"/api/tabs/{tab_id}/nodes",
        json={"role_name": "Designer", "name": "Writer"},
    )
    assert reader_response.status_code == 200
    assert writer_response.status_code == 200
    reader_id = reader_response.json()["id"]
    writer_id = writer_response.json()["id"]

    edge_response = client.post(
        f"/api/tabs/{tab_id}/edges",
        json={"from_node_id": reader_id, "to_node_id": writer_id},
    )
    assert edge_response.status_code == 200

    save_blueprint_response = client.post(
        f"/api/tabs/{tab_id}/blueprint",
        json={
            "name": "Saved Manual Network",
            "description": "Derived from the current network",
        },
    )

    assert save_blueprint_response.status_code == 200
    blueprint = save_blueprint_response.json()
    assert blueprint["node_count"] == 2
    assert blueprint["edge_count"] == 1

    derived_tab_response = client.post(
        "/api/tabs",
        json={
            "title": "Derived Network",
            "goal": "Start from blueprint",
            "blueprint_id": blueprint["id"],
        },
    )
    assert derived_tab_response.status_code == 200
    derived_tab = derived_tab_response.json()
    assert derived_tab["network_source"]["state"] == "blueprint-derived"

    extra_node_response = client.post(
        f"/api/tabs/{derived_tab['id']}/nodes",
        json={"role_name": "Worker", "name": "Extra Worker"},
    )
    assert extra_node_response.status_code == 200

    updated_detail_response = client.get(f"/api/tabs/{derived_tab['id']}")
    assert updated_detail_response.status_code == 200
    assert updated_detail_response.json()["tab"]["network_source"] == {
        "state": "drifted",
        "blueprint_id": blueprint["id"],
        "blueprint_name": "Saved Manual Network",
        "blueprint_version": 1,
        "blueprint_available": True,
    }
