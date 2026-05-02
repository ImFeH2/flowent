from __future__ import annotations

from pathlib import Path


def is_path_writable(path: str | Path, write_dirs: list[str]) -> bool:
    from flowent.settings import resolve_path

    p = resolve_path(path)
    return any(p.is_relative_to(resolve_path(directory)) for directory in write_dirs)


def build_bwrap_cmd(
    write_dirs: list[str],
    command: str,
    *,
    allow_network: bool = False,
    cwd: str | Path | None = None,
) -> list[str]:
    from flowent.settings import resolve_path

    resolved_cwd = resolve_path(cwd) if cwd is not None else None
    cmd = [
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
    if resolved_cwd is not None:
        cmd.extend(["--ro-bind", str(resolved_cwd), str(resolved_cwd)])
    for directory in write_dirs:
        resolved_dir = resolve_path(directory)
        cmd.extend(["--bind", str(resolved_dir), str(resolved_dir)])
    if not allow_network:
        cmd.append("--unshare-net")
    if resolved_cwd is not None:
        cmd.extend(["--chdir", str(resolved_cwd)])
    cmd.extend(["--die-with-parent", "--new-session", "--", "bash", "-c", command])
    return cmd
