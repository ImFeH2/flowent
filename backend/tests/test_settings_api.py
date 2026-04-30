from fastapi.testclient import TestClient

from flowent_api.main import create_app


def create_settings_snapshot() -> dict:
    return {
        "modelConnections": [
            {
                "id": "connection-local-service",
                "type": "openai-responses",
                "name": "Local model service",
                "accessKey": "saved-key",
                "endpointUrl": "http://localhost:4000/v1",
            },
        ],
        "modelPresets": [
            {
                "id": "preset-review",
                "name": "Review Model",
                "modelConnectionId": "connection-local-service",
                "modelName": "gpt-4.1",
                "temperature": 0.2,
                "outputLimit": 1800,
            },
        ],
        "blueprints": [],
        "roles": [],
    }


def test_returns_an_empty_result_when_settings_have_not_been_saved(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setenv("FLOWENT_TEST_HOME_DIRECTORY", str(tmp_path))
    client = TestClient(create_app())

    response = client.get("/api/settings")

    assert response.status_code == 200
    assert response.json() == {"saved": False, "settings": None}


def test_saves_and_reads_a_local_settings_snapshot(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOWENT_TEST_HOME_DIRECTORY", str(tmp_path))
    client = TestClient(create_app())
    settings = create_settings_snapshot()

    save_response = client.put("/api/settings", json={"settings": settings})
    read_response = client.get("/api/settings")

    assert save_response.status_code == 200
    assert save_response.json()["saved"] is True
    assert save_response.json()["settings"] == {
        "version": 1,
        "modelConnections": settings["modelConnections"],
        "modelPresets": settings["modelPresets"],
        "blueprints": settings["blueprints"],
        "roles": settings["roles"],
    }
    assert read_response.status_code == 200
    assert read_response.json()["saved"] is True
    assert (
        read_response.json()["settings"]["modelConnections"]
        == settings["modelConnections"]
    )


def test_rejects_malformed_request_data(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOWENT_TEST_HOME_DIRECTORY", str(tmp_path))
    client = TestClient(create_app())

    response = client.put(
        "/api/settings",
        content="{",
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 400
    assert response.json() == {
        "error": "Settings could not be saved because the data format is not valid."
    }


def test_rejects_settings_with_the_wrong_structure(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOWENT_TEST_HOME_DIRECTORY", str(tmp_path))
    client = TestClient(create_app())

    response = client.put(
        "/api/settings",
        json={
            "modelConnections": "connection-work-gateway",
            "modelPresets": [],
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "error": "Settings could not be saved because the data format is not valid."
    }


def test_returns_a_saving_failure_when_the_home_folder_cannot_be_prepared(
    tmp_path,
    monkeypatch,
):
    home_file = tmp_path / "home-file"
    home_file.write_text("not a directory", encoding="utf-8")
    monkeypatch.setenv("FLOWENT_TEST_HOME_DIRECTORY", str(home_file))
    client = TestClient(create_app())

    response = client.put("/api/settings", json=create_settings_snapshot())

    assert response.status_code == 500
    assert response.json() == {
        "error": "Settings could not be saved. Check that Flowent can write to your home folder."
    }
