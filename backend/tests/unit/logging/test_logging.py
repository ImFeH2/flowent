import logging
import re
from collections.abc import Iterator
from pathlib import Path

import pytest
from loguru import logger

from flowent_api.logging import (
    HealthcheckAccessFilter,
    configure_uvicorn_access_logging,
    detect_runtime_mode,
    setup_logging,
)


@pytest.fixture(autouse=True)
def cleanup_loguru() -> Iterator[None]:
    yield
    logger.remove()


def test_detect_runtime_mode_from_fastapi_command() -> None:
    assert detect_runtime_mode(["/venv/bin/fastapi", "dev", "app/main.py"]) == "dev"
    assert detect_runtime_mode(["/venv/bin/fastapi", "run", "app/main.py"]) == "release"


def test_detect_runtime_mode_from_reload_flag() -> None:
    assert detect_runtime_mode(["uvicorn", "flowent_api.main:app", "--reload"]) == "dev"
    assert detect_runtime_mode(["uvicorn", "flowent_api.main:app"]) == "release"


def test_setup_logging_creates_timestamped_file_and_prunes_old_logs(
    tmp_path: Path,
) -> None:
    log_dir = tmp_path / "logs"
    log_dir.mkdir()
    for i in range(1, 12):
        (log_dir / f"{i}.log").write_text(f"old-{i}", encoding="utf-8")

    setup_logging(argv=["fastapi", "run"], runtime_dir=tmp_path)

    log_files = sorted(path.name for path in log_dir.iterdir() if path.is_file())
    assert len(log_files) == 10
    assert "1.log" not in log_files
    assert "2.log" not in log_files
    assert any(
        re.fullmatch(r"\d{4}-\d{2}-\d{2}_\d{6}_\d+\.log", path) for path in log_files
    )


def test_setup_logging_writes_source_and_agent_id_to_file(tmp_path: Path) -> None:
    setup_logging(argv=["fastapi", "dev"], runtime_dir=tmp_path)

    with logger.contextualize(agent_id="agent-123"):
        logger.info("hello file log")

    log_files = sorted((tmp_path / "logs").iterdir())
    content = log_files[-1].read_text(encoding="utf-8")

    assert "hello file log" in content
    assert "agent:agent-123" in content
    assert "test_setup_logging_writes_source_and_agent_id_to_file" in content
    assert "hello file log\n\n" not in content


def test_setup_logging_sets_console_level_from_runtime_mode(
    capsys,
    tmp_path: Path,
) -> None:
    setup_logging(argv=["fastapi", "run"], runtime_dir=tmp_path)
    logger.debug("hidden release debug")
    logger.info("visible release info")
    release_output = capsys.readouterr().err

    setup_logging(argv=["fastapi", "dev"], runtime_dir=tmp_path)
    logger.debug("visible dev debug")
    dev_output = capsys.readouterr().err

    assert "hidden release debug" not in release_output
    assert "visible release info" in release_output
    assert "visible release info\n\n" not in release_output
    assert "visible dev debug" in dev_output


def test_healthcheck_access_filter_blocks_health_endpoint() -> None:
    access_filter = HealthcheckAccessFilter()
    record = logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg='%s - "%s %s HTTP/%s" %d',
        args=("127.0.0.1:12345", "GET", "/health?source=docker", "1.1", 200),
        exc_info=None,
    )

    assert access_filter.filter(record) is False


def test_healthcheck_access_filter_keeps_other_requests() -> None:
    access_filter = HealthcheckAccessFilter()
    record = logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg='%s - "%s %s HTTP/%s" %d',
        args=("127.0.0.1:12345", "GET", "/api/meta", "1.1", 200),
        exc_info=None,
    )

    assert access_filter.filter(record) is True


def test_configure_uvicorn_access_logging_installs_filter_once() -> None:
    access_logger = logging.getLogger("uvicorn.access")
    original_filters = list(access_logger.filters)
    access_logger.filters = [
        f for f in access_logger.filters if not isinstance(f, HealthcheckAccessFilter)
    ]

    try:
        configure_uvicorn_access_logging()
        configure_uvicorn_access_logging()

        filters = [
            f for f in access_logger.filters if isinstance(f, HealthcheckAccessFilter)
        ]
        assert len(filters) == 1
    finally:
        access_logger.filters = original_filters
