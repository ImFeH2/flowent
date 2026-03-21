from fastapi.testclient import TestClient


def test_list_formations_is_empty_at_startup(client: TestClient):
    response = client.get("/api/formations")

    assert response.status_code == 200
    assert response.json() == {"formations": []}


def test_get_formation_not_found(client: TestClient):
    response = client.get("/api/formations/non-existent")

    assert response.status_code == 404
    assert response.json() == {"detail": "Formation not found"}
