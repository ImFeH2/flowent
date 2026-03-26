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
    cwd: str | Path | None = None,
) -> list[str]:
    resolved_cwd = Path(cwd).resolve() if cwd is not None else None
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
    for d in write_dirs:
        cmd.extend(["--bind", d, d])
    if not allow_network:
        cmd.append("--unshare-net")
    if resolved_cwd is not None:
        cmd.extend(["--chdir", str(resolved_cwd)])
    cmd.extend(["--die-with-parent", "--new-session", "--", "bash", "-c", command])
    return cmd
