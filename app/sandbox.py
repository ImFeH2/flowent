from __future__ import annotations

from pathlib import Path


def is_path_writable(path: str | Path, write_dirs: list[str]) -> bool:
    p = Path(path).resolve()
    return any(p.is_relative_to(Path(d).resolve()) for d in write_dirs)


def build_bwrap_cmd(
    write_dirs: list[str],
    command: str,
    *,
    allow_network: bool = False,
) -> list[str]:
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
    for d in write_dirs:
        cmd.extend(["--bind", d, d])
    if not allow_network:
        cmd.append("--unshare-net")
    cmd.extend(["--die-with-parent", "--new-session", "--", "bash", "-c", command])
    return cmd
