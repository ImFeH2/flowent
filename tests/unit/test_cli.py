from app.access import is_access_configured, set_access_code
from app.cli import main


def test_access_reset_command_clears_persisted_access_code(
    monkeypatch, tmp_path, capsys
):
    import app.settings as settings_module

    settings_file = tmp_path / "settings.json"
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    settings = settings_module.Settings()
    set_access_code(settings, "TEST-ACCESS-CODE")
    settings_module.save_settings(settings)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    main(["access", "reset"])

    output = capsys.readouterr().out.strip()
    reloaded_settings = settings_module.load_settings()

    assert output == (
        "Access configuration cleared. Restart Autopoe to generate a new access code."
    )
    assert not is_access_configured(reloaded_settings.access)
