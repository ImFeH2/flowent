import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import create_app


def _create_client(monkeypatch, tmp_path, *, configured: bool) -> TestClient:
    import app.settings as settings_module
    from app.access import set_access_code

    settings_file = tmp_path / "settings.json"
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    settings = settings_module.Settings()
    if configured:
        set_access_code(settings, "TEST-ACCESS-CODE")
    settings_module.save_settings(settings)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    return TestClient(create_app())


def test_protected_api_requires_admin_session(monkeypatch, tmp_path):
    with _create_client(monkeypatch, tmp_path, configured=True) as client:
        access_state = client.get("/api/access/state")
        protected_response = client.get("/api/settings/bootstrap")

    assert access_state.status_code == 200
    assert access_state.json() == {
        "authenticated": False,
        "configured": True,
        "bootstrap_generated": False,
        "requires_restart": False,
    }
    assert protected_response.status_code == 401
    assert protected_response.json() == {"detail": "Access denied"}


def test_access_login_and_logout_flow(monkeypatch, tmp_path):
    with _create_client(monkeypatch, tmp_path, configured=True) as client:
        login_response = client.post(
            "/api/access/login",
            json={"code": "TEST-ACCESS-CODE"},
        )
        protected_response = client.get("/api/settings/bootstrap")
        logout_response = client.post("/api/access/logout")
        denied_response = client.get("/api/settings/bootstrap")

    assert login_response.status_code == 200
    assert login_response.json()["authenticated"] is True
    assert protected_response.status_code == 200
    assert logout_response.status_code == 200
    assert logout_response.json()["authenticated"] is False
    assert denied_response.status_code == 401


def test_websocket_requires_admin_session(monkeypatch, tmp_path):
    with _create_client(monkeypatch, tmp_path, configured=True) as client:
        with pytest.raises(WebSocketDisconnect), client.websocket_connect("/ws/events"):
            pass

        login_response = client.post(
            "/api/access/login",
            json={"code": "TEST-ACCESS-CODE"},
        )

        with client.websocket_connect("/ws/events"):
            pass

    assert login_response.status_code == 200


def test_access_state_reports_bootstrap_generated_code(monkeypatch, tmp_path):
    with _create_client(monkeypatch, tmp_path, configured=False) as client:
        access_state = client.get("/api/access/state")

    assert access_state.status_code == 200
    assert access_state.json() == {
        "authenticated": False,
        "configured": True,
        "bootstrap_generated": True,
        "requires_restart": False,
    }
