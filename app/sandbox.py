from __future__ import annotations

import time
from pathlib import Path


def is_path_writable(path: str | Path, write_dirs: list[str]) -> bool:
    p = Path(path).resolve()
    return any(p.is_relative_to(Path(d).resolve()) for d in write_dirs)


def build_firejail_cmd(
    write_dirs: list[str],
    command: str,
    timeout_secs: int = 30,
) -> list[str]:
    timeout_formatted = time.strftime("%H:%M:%S", time.gmtime(timeout_secs))
    cmd = [
        "firejail",
        "--noprofile",
        "--quiet",
        "--seccomp",
        "--read-only=/",
    ]
    if write_dirs:
        for d in write_dirs:
            cmd.append(f"--read-write={d}")
        cmd.append("--read-write=/tmp")
    cmd.extend([f"--timeout={timeout_formatted}", "bash", "-c", command])
    return cmd
