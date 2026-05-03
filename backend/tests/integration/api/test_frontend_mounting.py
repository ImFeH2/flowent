import json

from fastapi.testclient import TestClient

from flowent.main import create_app


def _create_client(monkeypatch, tmp_path, *, serve_frontend: bool) -> TestClient:
    import flowent.settings as settings_module

    settings_file = tmp_path / "settings.json"
    static_dir = tmp_path / "static"
    assets_dir = static_dir / "assets"

    assets_dir.mkdir(parents=True)
    (static_dir / "index.html").write_text(
        "<!doctype html><html><body>Flowent</body></html>",
        encoding="utf-8",
    )
    (assets_dir / "app.js").write_text("console.log('flowent')", encoding="utf-8")
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
    monkeypatch.setenv("FLOWENT_STATIC_DIR", str(static_dir))

    return TestClient(create_app(serve_frontend=serve_frontend))


def test_production_app_serves_frontend_index(monkeypatch, tmp_path):
    with _create_client(monkeypatch, tmp_path, serve_frontend=True) as client:
        response = client.get("/")
        nested_response = client.get("/workspace")
        asset_response = client.get("/assets/app.js")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert nested_response.status_code == 200
    assert nested_response.headers["content-type"].startswith("text/html")
    assert asset_response.status_code == 200


def test_dev_app_does_not_serve_frontend_routes(monkeypatch, tmp_path):
    with _create_client(monkeypatch, tmp_path, serve_frontend=False) as client:
        root_response = client.get("/")
        page_response = client.get("/workspace")

    assert root_response.status_code == 404
    assert page_response.status_code == 404
