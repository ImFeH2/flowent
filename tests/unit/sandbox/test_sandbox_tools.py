from app.sandbox import build_bwrap_cmd


def test_build_bwrap_cmd_omits_bind_mounts_when_write_dirs_empty():
    cmd = build_bwrap_cmd([], "pwd")

    assert cmd[:10] == [
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
    ]
    assert "--bind" not in cmd
    assert "--unshare-net" in cmd
    assert cmd[-5:] == ["--new-session", "--", "bash", "-c", "pwd"]


def test_build_bwrap_cmd_binds_write_dirs_and_preserves_network_when_allowed(tmp_path):
    writable = tmp_path / "workspace"
    writable.mkdir()

    cmd = build_bwrap_cmd(
        [str(writable)],
        "pwd",
        allow_network=True,
    )

    bind_index = cmd.index("--bind")
    assert cmd[bind_index : bind_index + 3] == [
        "--bind",
        str(writable),
        str(writable),
    ]
    assert "--unshare-net" not in cmd
    assert cmd[-3:] == ["bash", "-c", "pwd"]
