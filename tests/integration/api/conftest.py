import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch, tmp_path):
    import app.settings as settings_module
    from app.access import set_access_code

    settings_file = tmp_path / "settings.json"
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    settings = settings_module.Settings()
    set_access_code(settings, "TEST-ACCESS-CODE")
    settings_module.save_settings(settings)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    from app.main import app

    with TestClient(app) as client:
        login_response = client.post(
            "/api/access/login",
            json={"code": "TEST-ACCESS-CODE"},
        )
        assert login_response.status_code == 200
        yield client

    monkeypatch.setattr(settings_module, "_cached_settings", None)
