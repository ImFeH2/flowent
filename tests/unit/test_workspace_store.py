import json

from app.settings import Settings
from app.workspace_store import workspace_store


def test_workspace_store_normalizes_relative_write_dirs_on_load(
    monkeypatch,
    tmp_path,
):
    import app.settings as settings_module

    settings_file = tmp_path / "settings.json"
    workspace_file = tmp_path / "workspace.json"
    working_dir = tmp_path / "workspace-root"
    working_dir.mkdir()
    workspace_file.write_text(
        json.dumps(
            {
                "tabs": [],
                "nodes": [
                    {
                        "id": "node-1",
                        "config": {
                            "node_type": "agent",
                            "role_name": "Worker",
                            "tab_id": "tab-1",
                            "name": "Worker",
                            "tools": ["read"],
                            "write_dirs": ["./out"],
                            "allow_network": False,
                        },
                        "state": "idle",
                        "todos": [],
                        "history": [],
                    }
                ],
                "edges": [],
                "blueprints": [],
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(
        settings_module,
        "get_settings",
        lambda: Settings(working_dir=str(working_dir)),
    )
    workspace_store.reset_cache()

    record = workspace_store.get_node_record("node-1")

    assert record is not None
    assert record.config.write_dirs == [str((working_dir / "out").resolve())]
    persisted = json.loads(workspace_file.read_text(encoding="utf-8"))
    assert persisted["nodes"][0]["config"]["write_dirs"] == [
        str((working_dir / "out").resolve())
    ]
    workspace_store.reset_cache()
