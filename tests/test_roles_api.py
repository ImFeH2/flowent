import pytest
from fastapi.testclient import TestClient

from app.settings import RoleConfig, Settings


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as client:
        yield client


def test_create_role_rejects_duplicate_name(client: TestClient, monkeypatch):
    settings = Settings(roles=[RoleConfig(name="Writer", system_prompt="draft")])
    saved: list[Settings] = []

    monkeypatch.setattr("app.routes.roles.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.roles.save_settings",
        lambda updated: saved.append(updated),
    )

    response = client.post(
        "/api/roles",
        json={"name": "Writer", "system_prompt": "another prompt"},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Role 'Writer' already exists"}
    assert saved == []


def test_update_and_delete_role_use_name_path(client: TestClient, monkeypatch):
    settings = Settings(
        roles=[
            RoleConfig(name="Writer", system_prompt="draft"),
            RoleConfig(name="Reviewer", system_prompt="review"),
        ]
    )
    saved: list[list[tuple[str, str]]] = []

    monkeypatch.setattr("app.routes.roles.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.routes.roles.save_settings",
        lambda updated: saved.append(
            [(role.name, role.system_prompt) for role in updated.roles]
        ),
    )

    duplicate = client.put("/api/roles/Writer", json={"name": "Reviewer"})

    assert duplicate.status_code == 409
    assert duplicate.json() == {"detail": "Role 'Reviewer' already exists"}

    update = client.put(
        "/api/roles/Writer",
        json={"name": "Researcher", "system_prompt": "investigate"},
    )

    assert update.status_code == 200
    assert update.json() == {
        "name": "Researcher",
        "system_prompt": "investigate",
    }

    delete = client.delete("/api/roles/Researcher")

    assert delete.status_code == 200
    assert delete.json() == {"status": "deleted"}
    assert [(role.name, role.system_prompt) for role in settings.roles] == [
        ("Reviewer", "review")
    ]
    assert saved == [
        [("Researcher", "investigate"), ("Reviewer", "review")],
        [("Reviewer", "review")],
    ]
