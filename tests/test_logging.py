from collections.abc import Iterator
from pathlib import Path

import pytest
from loguru import logger

from app.logging import detect_runtime_mode, setup_logging


@pytest.fixture(autouse=True)
def cleanup_loguru() -> Iterator[None]:
    yield
    logger.remove()


def test_detect_runtime_mode_from_fastapi_command() -> None:
    assert detect_runtime_mode(["/venv/bin/fastapi", "dev", "app/main.py"]) == "dev"
    assert detect_runtime_mode(["/venv/bin/fastapi", "run", "app/main.py"]) == "release"


def test_detect_runtime_mode_from_reload_flag() -> None:
    assert detect_runtime_mode(["uvicorn", "app.main:app", "--reload"]) == "dev"
    assert detect_runtime_mode(["uvicorn", "app.main:app"]) == "release"


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
    assert any(path.endswith(".log") and path[:-4].isdigit() for path in log_files)


def test_setup_logging_writes_source_and_agent_id_to_file(tmp_path: Path) -> None:
    setup_logging(argv=["fastapi", "dev"], runtime_dir=tmp_path)

    with logger.contextualize(agent_id="agent-123"):
        logger.info("hello file log")

    log_files = sorted((tmp_path / "logs").iterdir())
    content = log_files[-1].read_text(encoding="utf-8")

    assert "hello file log" in content
    assert "agent:agent-123" in content
    assert "test_setup_logging_writes_source_and_agent_id_to_file" in content


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
    assert "visible dev debug" in dev_output
