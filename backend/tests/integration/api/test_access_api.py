import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from flowent_api.main import create_app


def _create_client(monkeypatch, tmp_path, *, configured: bool) -> TestClient:
    import flowent_api.settings as settings_module
    from flowent_api.access import set_access_code

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


def test_admin_session_survives_backend_restart(monkeypatch, tmp_path):
    import flowent_api.settings as settings_module

    with _create_client(monkeypatch, tmp_path, configured=True) as client:
        login_response = client.post(
            "/api/access/login",
            json={"code": "TEST-ACCESS-CODE"},
        )
        session_cookie = client.cookies.get("flowent_admin_session")

    assert login_response.status_code == 200
    assert session_cookie
    persisted_settings, _ = settings_module._read_settings_file()
    assert persisted_settings.access.code == "TEST-ACCESS-CODE"
    assert persisted_settings.access.session_signing_secret

    with _create_client(monkeypatch, tmp_path, configured=True) as restarted_client:
        restarted_client.cookies.set("flowent_admin_session", session_cookie)
        access_state = restarted_client.get("/api/access/state")
        protected_response = restarted_client.get("/api/settings/bootstrap")

    assert access_state.status_code == 200
    assert access_state.json()["authenticated"] is True
    assert protected_response.status_code == 200


def test_access_code_rotation_invalidates_existing_admin_session(
    monkeypatch,
    tmp_path,
):
    import flowent_api.settings as settings_module
    from flowent_api.access import set_access_code

    with _create_client(monkeypatch, tmp_path, configured=True) as client:
        login_response = client.post(
            "/api/access/login",
            json={"code": "TEST-ACCESS-CODE"},
        )
        session_cookie = client.cookies.get("flowent_admin_session")

    assert login_response.status_code == 200
    assert session_cookie

    rotated_settings = settings_module.get_settings()
    set_access_code(rotated_settings, "NEW-ACCESS-CODE")
    settings_module.save_settings(rotated_settings)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    with TestClient(create_app()) as restarted_client:
        restarted_client.cookies.set("flowent_admin_session", session_cookie)
        access_state = restarted_client.get("/api/access/state")
        protected_response = restarted_client.get("/api/settings/bootstrap")

    assert access_state.status_code == 200
    assert access_state.json()["authenticated"] is False
    assert protected_response.status_code == 401
    assert protected_response.json() == {"detail": "Access denied"}


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


def test_legacy_hashed_only_access_rotates_to_persisted_code_at_startup(
    monkeypatch,
    tmp_path,
):
    import flowent_api.settings as settings_module
    from flowent_api.access import set_access_code, verify_access_code

    settings_file = tmp_path / "settings.json"
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    settings = settings_module.Settings()
    set_access_code(settings, "OLD-ACCESS-CODE")
    settings.access.code = ""
    settings_module.save_settings(settings)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    with TestClient(create_app()) as client:
        access_state = client.get("/api/access/state")

    assert access_state.status_code == 200
    assert access_state.json() == {
        "authenticated": False,
        "configured": True,
        "bootstrap_generated": True,
        "requires_restart": False,
    }

    persisted_settings = settings_module.load_settings()
    assert persisted_settings.access.code
    assert persisted_settings.access.code != "OLD-ACCESS-CODE"
    assert verify_access_code(
        persisted_settings.access,
        persisted_settings.access.code,
    )
    assert not verify_access_code(persisted_settings.access, "OLD-ACCESS-CODE")
