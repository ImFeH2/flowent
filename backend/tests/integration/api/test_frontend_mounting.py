import json

from fastapi.testclient import TestClient

from flowent.main import create_app


def _create_client(monkeypatch, tmp_path, *, serve_frontend: bool) -> TestClient:
    import flowent.settings as settings_module

    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "event_log": {"timestamp_format": "absolute"},
                "model": {"active_provider_id": "", "active_model": ""},
                "custom_prompt": "",
                "custom_post_prompt": "",
                "providers": [],
                "roles": [],
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    return TestClient(create_app(serve_frontend=serve_frontend))


def test_production_app_serves_frontend_index(monkeypatch, tmp_path):
    with _create_client(monkeypatch, tmp_path, serve_frontend=True) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")


def test_dev_app_does_not_serve_frontend_routes(monkeypatch, tmp_path):
    with _create_client(monkeypatch, tmp_path, serve_frontend=False) as client:
        root_response = client.get("/")
        page_response = client.get("/workspace")

    assert root_response.status_code == 404
    assert page_response.status_code == 404
