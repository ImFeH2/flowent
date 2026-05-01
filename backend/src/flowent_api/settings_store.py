from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any

LOCAL_DATA_DIRECTORY_NAME = ".flowent"
LOCAL_SETTINGS_FILE_NAME = "settings.json"
LOCAL_SETTINGS_VERSION = 1

CONNECTION_TYPES = {"openai", "openai-responses", "anthropic", "gemini"}
LEGACY_CONNECTION_TYPES = {"openai", "anthropic", "custom"}
LEGACY_CONNECTION_TYPE_MAP = {
    "openai": "openai",
    "anthropic": "anthropic",
    "custom": "openai",
}
MODEL_PRESET_TEST_STATUSES = {"idle", "success", "error"}


class LocalSettingsStoreError(Exception):
    def __init__(self, message: str, user_message: str, kind: str) -> None:
        super().__init__(message)
        self.user_message = user_message
        self.kind = kind


def is_record(value: Any) -> bool:
    return isinstance(value, dict)


def is_string(value: Any) -> bool:
    return isinstance(value, str)


def is_finite_number(value: Any) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, int | float)
        and math.isfinite(value)
    )


def model_connection_id_from_legacy_id(identifier: str) -> str:
    prefix = "provider-"
    if identifier.startswith(prefix):
        return f"connection-{identifier[len(prefix) :]}"
    return identifier


def parse_model_connection(value: Any) -> dict[str, Any] | None:
    if (
        is_record(value)
        and is_string(value.get("id"))
        and value.get("type") in CONNECTION_TYPES
        and is_string(value.get("name"))
        and is_string(value.get("accessKey"))
        and is_string(value.get("endpointUrl"))
    ):
        return dict(value)

    if (
        not is_record(value)
        or not is_string(value.get("id"))
        or value.get("type") not in LEGACY_CONNECTION_TYPES
        or not is_string(value.get("name"))
        or not is_string(value.get("apiKey"))
        or not is_string(value.get("baseUrl"))
    ):
        return None

    return {
        "id": model_connection_id_from_legacy_id(value["id"]),
        "type": LEGACY_CONNECTION_TYPE_MAP.get(value["type"], "openai"),
        "name": value["name"],
        "accessKey": value["apiKey"],
        "endpointUrl": value["baseUrl"],
    }


def parse_model_preset(value: Any) -> dict[str, Any] | None:
    if (
        is_record(value)
        and is_string(value.get("id"))
        and is_string(value.get("name"))
        and is_string(value.get("modelConnectionId"))
        and is_string(value.get("modelName"))
        and is_finite_number(value.get("temperature"))
        and is_finite_number(value.get("outputLimit"))
        and ("topP" not in value or is_finite_number(value.get("topP")))
        and (
            "frequencyPenalty" not in value
            or is_finite_number(value.get("frequencyPenalty"))
        )
        and (
            "testStatus" not in value
            or value.get("testStatus") in MODEL_PRESET_TEST_STATUSES
        )
        and ("testMessage" not in value or is_string(value.get("testMessage")))
    ):
        return dict(value)

    if (
        not is_record(value)
        or not is_string(value.get("id"))
        or not is_string(value.get("name"))
        or not is_string(value.get("providerId"))
        or not is_string(value.get("modelId"))
        or not is_finite_number(value.get("temperature"))
        or not is_finite_number(value.get("maxTokens"))
    ):
        return None

    preset: dict[str, Any] = {
        "id": value["id"],
        "name": value["name"],
        "modelConnectionId": model_connection_id_from_legacy_id(value["providerId"]),
        "modelName": value["modelId"],
        "temperature": value["temperature"],
        "outputLimit": value["maxTokens"],
    }

    if value.get("testStatus") in MODEL_PRESET_TEST_STATUSES:
        preset["testStatus"] = value["testStatus"]

    if "testMessage" in value and is_string(value.get("testMessage")):
        preset["testMessage"] = value.get("testMessage")

    return preset


def parse_role(value: Any) -> dict[str, Any] | None:
    if (
        is_record(value)
        and is_string(value.get("id"))
        and is_string(value.get("name"))
        and is_string(value.get("avatar"))
        and is_string(value.get("systemPrompt"))
        and is_string(value.get("modelPresetId"))
    ):
        return dict(value)
    return None


def is_plain_json_value(value: Any) -> bool:
    if value is None or isinstance(value, str | bool) or is_finite_number(value):
        return True

    if isinstance(value, list):
        return all(is_plain_json_value(item) for item in value)

    if is_record(value):
        return all(is_plain_json_value(item) for item in value.values())

    return False


def normalize_saved_json(value: Any) -> Any:
    if isinstance(value, list):
        return [normalize_saved_json(item) for item in value]

    if not is_record(value):
        return value

    normalized = {key: normalize_saved_json(item) for key, item in value.items()}

    if normalized.get("errorMessage") == "The provider returned an empty completion.":
        normalized["errorMessage"] = "The selected service returned an empty response."

    if (
        normalized.get("kind") == "agent"
        and is_string(normalized.get("modelId"))
        and "modelName" not in normalized
    ):
        normalized["modelName"] = normalized["modelId"]
        del normalized["modelId"]

    return normalized


def parse_blueprint_asset(value: Any) -> dict[str, Any] | None:
    if (
        not is_record(value)
        or not is_string(value.get("id"))
        or not is_string(value.get("name"))
        or not is_string(value.get("updatedAt"))
        or not is_string(value.get("summary"))
        or not isinstance(value.get("nodes"), list)
        or not all(is_plain_json_value(item) for item in value["nodes"])
        or not isinstance(value.get("edges"), list)
        or not all(is_plain_json_value(item) for item in value["edges"])
    ):
        return None

    return {
        "id": value["id"],
        "name": value["name"],
        "updatedAt": value["updatedAt"],
        "summary": value["summary"],
        "nodes": [normalize_saved_json(item) for item in value["nodes"]],
        "edges": [normalize_saved_json(item) for item in value["edges"]],
    }


def parse_array(
    value: Any, name: str, parser: Any
) -> tuple[list[dict[str, Any]] | None, str | None]:
    if not isinstance(value, list):
        return None, f"{name} must be a list."

    items = [parser(item) for item in value]
    if any(item is None for item in items):
        return None, f"{name} contains an item with an invalid format."

    return items, None


def parse_local_settings_snapshot(
    value: Any,
) -> tuple[dict[str, Any] | None, str | None]:
    if not is_record(value):
        return None, "Settings must be saved as a single object."

    raw_model_connections = (
        value.get("modelConnections")
        if "modelConnections" in value
        else value.get("providers")
    )
    model_connections, error = parse_array(
        raw_model_connections,
        "modelConnections",
        parse_model_connection,
    )
    if error:
        return None, error

    model_presets, error = parse_array(
        value.get("modelPresets"),
        "modelPresets",
        parse_model_preset,
    )
    if error:
        return None, error

    model_connection_ids = {connection["id"] for connection in model_connections or []}
    if any(
        preset["modelConnectionId"] not in model_connection_ids
        for preset in model_presets or []
    ):
        return (
            None,
            "modelPresets contains an item with an unavailable model connection.",
        )

    blueprints, error = parse_array(
        value.get("blueprints", []),
        "blueprints",
        parse_blueprint_asset,
    )
    if error:
        return None, error

    roles, error = parse_array(value.get("roles", []), "roles", parse_role)
    if error:
        return None, error

    return (
        {
            "version": LOCAL_SETTINGS_VERSION,
            "modelConnections": model_connections,
            "modelPresets": model_presets,
            "blueprints": blueprints,
            "roles": roles,
        },
        None,
    )


def get_home_directory(home_directory: str | None = None) -> Path:
    raw_home_directory = (
        home_directory
        or os.environ.get("FLOWENT_TEST_HOME_DIRECTORY")
        or str(Path.home())
    )
    resolved_home_directory = Path(raw_home_directory)

    if not raw_home_directory or not resolved_home_directory.is_absolute():
        raise LocalSettingsStoreError(
            "Home directory is unavailable.",
            "We could not find your home folder.",
            "storage",
        )

    return resolved_home_directory


def get_local_settings_paths(home_directory: str | None = None) -> dict[str, Path]:
    root = get_home_directory(home_directory)
    data_directory = root / LOCAL_DATA_DIRECTORY_NAME
    settings_file = data_directory / LOCAL_SETTINGS_FILE_NAME
    return {"data_directory": data_directory, "settings_file": settings_file}


def read_local_settings_snapshot(
    home_directory: str | None = None,
) -> dict[str, Any]:
    settings_file = get_local_settings_paths(home_directory)["settings_file"]

    try:
        file_contents = settings_file.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {"status": "missing", "settings": None}
    except OSError as error:
        raise LocalSettingsStoreError(
            str(error),
            "Saved settings could not be loaded.",
            "read",
        ) from error

    try:
        parsed_contents = json.loads(file_contents)
    except json.JSONDecodeError as error:
        raise LocalSettingsStoreError(
            str(error),
            "Saved settings could not be loaded. Save again to replace them.",
            "read",
        ) from error

    settings, validation_error = parse_local_settings_snapshot(parsed_contents)
    if validation_error:
        raise LocalSettingsStoreError(
            validation_error,
            "Saved settings could not be loaded. Save again to replace them.",
            "read",
        )

    return {"status": "found", "settings": settings}


def save_local_settings_snapshot(
    value: Any,
    home_directory: str | None = None,
) -> dict[str, Any]:
    settings, validation_error = parse_local_settings_snapshot(value)
    if validation_error:
        raise LocalSettingsStoreError(
            validation_error,
            "Settings could not be saved because the data format is not valid.",
            "invalid-settings",
        )

    paths = get_local_settings_paths(home_directory)
    data_directory = paths["data_directory"]
    settings_file = paths["settings_file"]
    temporary_file = settings_file.with_name(f"{settings_file.name}.tmp")

    try:
        data_directory.mkdir(parents=True, exist_ok=True)
        temporary_file.write_text(
            f"{json.dumps(settings, indent=2, ensure_ascii=False)}\n",
            encoding="utf-8",
        )
        temporary_file.replace(settings_file)
    except OSError as error:
        try:
            temporary_file.unlink()
        except OSError:
            pass
        raise LocalSettingsStoreError(
            str(error),
            "Settings could not be saved. Check that Flowent can write to your home folder.",
            "storage",
        ) from error

    return settings
