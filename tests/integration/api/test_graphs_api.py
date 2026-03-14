from fastapi.testclient import TestClient


def test_list_graphs_is_empty_at_startup(client: TestClient):
    response = client.get("/api/graphs")

    assert response.status_code == 200
    assert response.json() == {"graphs": []}


def test_get_graph_not_found(client: TestClient):
    response = client.get("/api/graphs/non-existent")

    assert response.status_code == 404
    assert response.json() == {"detail": "Graph not found"}
