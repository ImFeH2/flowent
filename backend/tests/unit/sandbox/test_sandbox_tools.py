from flowent_api.sandbox import build_bwrap_cmd
from flowent_api.settings import Settings


def test_build_bwrap_cmd_mounts_cwd_read_only_and_chdirs_into_it(tmp_path):
    cmd = build_bwrap_cmd([], "pwd", cwd=tmp_path)

    assert cmd[:13] == [
        "bwrap",
        "--ro-bind",
        "/",
        "/",
        "--dev",
        "/dev",
        "--proc",
        "/proc",
        "--tmpfs",
        "/tmp",
        "--ro-bind",
        str(tmp_path),
        str(tmp_path),
    ]
    assert "--bind" not in cmd
    assert "--unshare-net" in cmd
    assert "--chdir" in cmd
    chdir_index = cmd.index("--chdir")
    assert cmd[chdir_index : chdir_index + 2] == ["--chdir", str(tmp_path)]
    assert cmd[-5:] == ["--new-session", "--", "bash", "-c", "pwd"]


def test_build_bwrap_cmd_binds_write_dirs_and_preserves_network_when_allowed(tmp_path):
    writable = tmp_path / "workspace"
    writable.mkdir()

    cmd = build_bwrap_cmd(
        [str(writable)],
        "pwd",
        allow_network=True,
        cwd=writable,
    )

    assert [
        "--ro-bind",
        str(writable),
        str(writable),
    ] in [cmd[index : index + 3] for index in range(len(cmd) - 2)]
    bind_index = cmd.index("--bind")
    assert cmd[bind_index : bind_index + 3] == [
        "--bind",
        str(writable),
        str(writable),
    ]
    assert "--unshare-net" not in cmd
    chdir_index = cmd.index("--chdir")
    assert cmd[chdir_index : chdir_index + 2] == ["--chdir", str(writable)]
    assert cmd[-3:] == ["bash", "-c", "pwd"]


def test_build_bwrap_cmd_resolves_relative_write_dirs_against_working_dir(
    monkeypatch,
    tmp_path,
):
    writable = tmp_path / "workspace"
    writable.mkdir()

    monkeypatch.setattr(
        "flowent_api.settings.get_settings",
        lambda: Settings(working_dir=str(tmp_path)),
    )

    cmd = build_bwrap_cmd(["./workspace"], "pwd", cwd=tmp_path)

    bind_index = cmd.index("--bind")
    assert cmd[bind_index : bind_index + 3] == [
        "--bind",
        str(writable),
        str(writable),
    ]
