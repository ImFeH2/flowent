from __future__ import annotations

import logging
import sys
import time
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Literal

from loguru import logger

if TYPE_CHECKING:
    from loguru import Record

from app.config import Config

RuntimeMode = Literal["dev", "release"]

CONSOLE_FORMAT = (
    "<green>{time:HH:mm:ss.SSS}</green> | "
    "<level>{level: <8}</level> | "
    "<cyan>{extra[source]}</cyan>{extra[agent_suffix]} | "
    "<level>{message}</level>{exception}"
)

FILE_FORMAT = (
    "{time:YYYY-MM-DD HH:mm:ss.SSS} | "
    "{level: <8} | "
    "{extra[source]}{extra[agent_suffix]} | "
    "{message}{exception}"
)


class HealthcheckAccessFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if not isinstance(args, tuple) or len(args) < 3:
            return True
        full_path = args[2]
        if not isinstance(full_path, str):
            return True
        return full_path.split("?", 1)[0] != "/health"


def detect_runtime_mode(
    argv: Sequence[str] | None = None,
    config: Config | None = None,
) -> RuntimeMode:
    args = list(sys.argv if argv is None else argv)
    executable = Path(args[0]).name.lower() if args else ""
    command = args[1] if len(args) > 1 else ""

    if "fastapi" in executable and command == "dev":
        return "dev"
    if "fastapi" in executable and command == "run":
        return "release"
    if command == "dev":
        return "dev"
    if command == "run":
        return "release"
    if "--reload" in args:
        return "dev"
    if config is not None and config.DEBUG:
        return "dev"
    return "release"


def _patch_record(record: Record) -> None:
    agent_id = record["extra"].get("agent_id")
    record["extra"]["agent_suffix"] = f" | agent:{agent_id}" if agent_id else ""
    record["extra"]["source"] = (
        f"{record['name']}:{record['function']}:{record['line']}"
    )


def _get_log_dir(runtime_dir: Path | None = None) -> Path:
    base_dir = Path.cwd() if runtime_dir is None else runtime_dir
    return base_dir / "logs"


def _allocate_log_file(log_dir: Path) -> Path:
    timestamp = time.time_ns() // 1_000_000
    prefix = datetime.fromtimestamp(timestamp / 1000).strftime("%Y-%m-%d_%H%M%S")
    log_path = log_dir / f"{prefix}_{timestamp}.log"
    while log_path.exists():
        timestamp += 1
        prefix = datetime.fromtimestamp(timestamp / 1000).strftime("%Y-%m-%d_%H%M%S")
        log_path = log_dir / f"{prefix}_{timestamp}.log"
    return log_path


def _sort_key(path: Path) -> tuple[int, int, str]:
    try:
        timestamp = int(path.stem.rsplit("_", 1)[-1])
    except ValueError:
        try:
            timestamp = int(path.stem)
        except ValueError:
            timestamp = -1
    return (timestamp, path.stat().st_mtime_ns, path.name)


def prune_old_logs(log_dir: Path, keep: int = 10) -> None:
    log_files = [path for path in log_dir.iterdir() if path.is_file()]
    log_files.sort(key=_sort_key, reverse=True)
    for path in log_files[keep:]:
        path.unlink(missing_ok=True)


def configure_uvicorn_access_logging() -> None:
    access_logger = logging.getLogger("uvicorn.access")
    if any(isinstance(f, HealthcheckAccessFilter) for f in access_logger.filters):
        return
    access_logger.addFilter(HealthcheckAccessFilter())


def setup_logging(
    config: Config | None = None,
    *,
    argv: Sequence[str] | None = None,
    runtime_dir: Path | None = None,
) -> None:
    if config is None:
        config = Config()

    mode = detect_runtime_mode(argv=argv, config=config)
    console_level = "DEBUG" if mode == "dev" else "INFO"

    logger.remove()
    logger.configure(patcher=_patch_record)
    configure_uvicorn_access_logging()

    log_dir = _get_log_dir(runtime_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = _allocate_log_file(log_dir)
    log_path.touch()
    prune_old_logs(log_dir)

    logger.add(
        sys.stderr,
        format=CONSOLE_FORMAT,
        level=console_level,
        colorize=True,
        backtrace=True,
        diagnose=mode == "dev",
    )

    logger.add(
        log_path,
        format=FILE_FORMAT,
        level="TRACE",
        backtrace=True,
        diagnose=mode == "dev",
    )
