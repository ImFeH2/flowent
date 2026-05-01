import json

import pytest

from flowent_api.settings_store import (
    LocalSettingsStoreError,
    get_local_settings_paths,
    parse_local_settings_snapshot,
    read_local_settings_snapshot,
    save_local_settings_snapshot,
)


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


def test_stores_settings_in_a_stable_file_under_the_home_folder(tmp_path):
    settings = create_settings_snapshot()

    save_local_settings_snapshot(settings, str(tmp_path))

    paths = get_local_settings_paths(str(tmp_path))
    file_contents = json.loads(paths["settings_file"].read_text(encoding="utf-8"))

    assert paths["data_directory"] == tmp_path / ".flowent"
    assert paths["settings_file"] == tmp_path / ".flowent" / "settings.json"
    assert file_contents == {
        "version": 1,
        "modelConnections": settings["modelConnections"],
        "modelPresets": settings["modelPresets"],
        "blueprints": settings["blueprints"],
        "roles": settings["roles"],
    }


def test_reads_a_previously_saved_settings_snapshot(tmp_path):
    settings = create_settings_snapshot()

    save_local_settings_snapshot(settings, str(tmp_path))

    assert read_local_settings_snapshot(str(tmp_path)) == {
        "status": "found",
        "settings": {
            "version": 1,
            "modelConnections": settings["modelConnections"],
            "modelPresets": settings["modelPresets"],
            "blueprints": settings["blueprints"],
            "roles": settings["roles"],
        },
    }


def test_treats_a_missing_settings_file_as_an_empty_saved_state(tmp_path):
    assert read_local_settings_snapshot(str(tmp_path)) == {
        "status": "missing",
        "settings": None,
    }


def test_rejects_settings_with_invalid_connection_or_preset_sections():
    settings, error = parse_local_settings_snapshot(
        {
            "modelConnections": "connection-work-gateway",
            "modelPresets": [],
        }
    )

    assert settings is None
    assert error == "modelConnections must be a list."

    settings, error = parse_local_settings_snapshot(
        {
            "modelConnections": [],
            "modelPresets": [
                {
                    "id": "preset-missing",
                    "name": "Missing Model",
                    "modelConnectionId": "connection-missing",
                    "modelName": "gpt-4.1",
                    "temperature": 0.2,
                    "outputLimit": 1800,
                }
            ],
        }
    )

    assert settings is None
    assert (
        error == "modelPresets contains an item with an unavailable model connection."
    )


def test_normalizes_older_saved_connection_settings():
    settings, error = parse_local_settings_snapshot(
        {
            "providers": [
                {
                    "id": "provider-local",
                    "type": "custom",
                    "name": "Local service",
                    "apiKey": "legacy-key",
                    "baseUrl": "http://localhost:4000/v1",
                }
            ],
            "modelPresets": [
                {
                    "id": "preset-legacy",
                    "name": "Legacy Model",
                    "providerId": "provider-local",
                    "modelId": "gpt-4.1",
                    "temperature": 0.1,
                    "maxTokens": 900,
                }
            ],
            "blueprints": [],
            "roles": [],
        }
    )

    assert error is None
    assert settings == {
        "version": 1,
        "modelConnections": [
            {
                "id": "connection-local",
                "type": "openai",
                "name": "Local service",
                "accessKey": "legacy-key",
                "endpointUrl": "http://localhost:4000/v1",
            }
        ],
        "modelPresets": [
            {
                "id": "preset-legacy",
                "name": "Legacy Model",
                "modelConnectionId": "connection-local",
                "modelName": "gpt-4.1",
                "temperature": 0.1,
                "outputLimit": 900,
            }
        ],
        "blueprints": [],
        "roles": [],
    }


def test_drops_legacy_run_fields_and_normalizes_node_data():
    blueprint = {
        "id": "blueprint-launch",
        "name": "Launch Campaign",
        "updatedAt": "2026-04-27T10:00:00.000Z",
        "lastRunStatus": "success",
        "summary": "Prepare launch work.",
        "nodes": [
            {
                "id": "agent-1",
                "type": "workflow",
                "position": {"x": 100, "y": 100},
                "data": {
                    "kind": "agent",
                    "title": "Reviewer",
                    "modelId": "gpt-4.1",
                    "status": "success",
                    "errorMessage": "The provider returned an empty completion.",
                },
            }
        ],
        "edges": [],
        "runHistory": [
            {
                "id": "run-1",
                "startedAt": "2026-04-27T10:00:00.000Z",
                "updatedAt": "2026-04-27T10:01:00.000Z",
                "status": "success",
                "summary": "Run finished.",
                "nodes": [],
                "edges": [],
            }
        ],
        "selectedRunId": "run-1",
    }
    settings = create_settings_snapshot() | {"blueprints": [blueprint]}

    parsed, error = parse_local_settings_snapshot(settings)

    assert error is None
    assert parsed is not None
    parsed_blueprint = parsed["blueprints"][0]
    assert parsed_blueprint["nodes"][0]["data"]["modelName"] == "gpt-4.1"
    assert "modelId" not in parsed_blueprint["nodes"][0]["data"]
    assert (
        parsed_blueprint["nodes"][0]["data"]["errorMessage"]
        == "The selected service returned an empty response."
    )
    assert "runHistory" not in parsed_blueprint
    assert "selectedRunId" not in parsed_blueprint
    assert "lastRunStatus" not in parsed_blueprint


def test_fails_without_falling_back_when_the_home_folder_cannot_hold_settings(
    tmp_path,
):
    home_file = tmp_path / "home-file"
    home_file.write_text("not a directory", encoding="utf-8")

    with pytest.raises(LocalSettingsStoreError) as error:
        save_local_settings_snapshot(create_settings_snapshot(), str(home_file))

    assert (
        error.value.user_message
        == "Settings could not be saved. Check that Flowent can write to your home folder."
    )
