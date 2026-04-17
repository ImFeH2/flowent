import pytest

from app.access import is_access_configured, set_access_code, verify_access_code
from app.cli import main


def test_access_refresh_command_generates_new_persisted_access_code(
    monkeypatch, tmp_path, capsys
):
    import app.settings as settings_module

    settings_file = tmp_path / "settings.json"
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    settings = settings_module.Settings()
    set_access_code(settings, "OLD-ACCESS-CODE")
    settings_module.save_settings(settings)
    monkeypatch.setattr(settings_module, "_cached_settings", None)

    main(["access", "refresh"])

    output = capsys.readouterr().out.strip()
    reloaded_settings = settings_module.load_settings()

    assert output.startswith("Generated new access code: ")
    next_code = output.removeprefix("Generated new access code: ").strip()
    assert next_code
    assert verify_access_code(reloaded_settings.access, next_code)
    assert not verify_access_code(reloaded_settings.access, "OLD-ACCESS-CODE")


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


def test_help_output_no_longer_lists_mcp_command(capsys):
    with pytest.raises(SystemExit) as exc:
        main(["--help"])

    assert exc.value.code == 0
    output = capsys.readouterr().out

    assert "access" in output
    assert "mcp" not in output


def test_removed_mcp_command_is_rejected(capsys):
    with pytest.raises(SystemExit) as exc:
        main(["mcp", "serve"])

    assert exc.value.code == 2
    error_output = capsys.readouterr().err

    assert "invalid choice" in error_output
    assert "'mcp'" in error_output
