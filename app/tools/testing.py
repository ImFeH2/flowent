from __future__ import annotations

import json
import subprocess
from typing import TYPE_CHECKING, Any, ClassVar

from loguru import logger

from app.events import event_bus
from app.models import Event, EventType, Message
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class SubmitResultTool(Tool):
    name = "submit_result"
    description = "Submit work results. Commits changes, runs test suite, generates report, notifies supervisor, and terminates."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": "Brief summary of completed work",
            },
        },
        "required": ["summary"],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app import git
        from app.registry import registry

        summary = args["summary"]
        worktree_path = agent.config.worktree_path
        if not worktree_path:
            return json.dumps({"error": "No worktree configured"})

        commit_sha = git.commit_all(worktree_path, f"agent/{agent.uuid}: {summary}")
        logger.info(
            "Agent {} committed: {}",
            agent.uuid[:8],
            commit_sha or "no changes",
        )

        test_results: list[dict[str, Any]] = []
        all_passed = True
        for i, script in enumerate(agent.config.testsuite.scripts):
            try:
                result = subprocess.run(
                    ["python", "-c", script],
                    cwd=worktree_path,
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                passed = result.returncode == 0
                test_results.append(
                    {
                        "test": i,
                        "passed": passed,
                        "stdout": result.stdout[:500],
                        "stderr": result.stderr[:500],
                    },
                )
                if not passed:
                    all_passed = False
                    logger.warning("Agent {} test {} failed", agent.uuid[:8], i)
            except subprocess.TimeoutExpired:
                test_results.append({"test": i, "passed": False, "error": "Timeout"})
                all_passed = False
                logger.warning("Agent {} test {} timed out", agent.uuid[:8], i)

        report = {
            "agent_id": agent.uuid,
            "summary": summary,
            "commit": commit_sha,
            "branch": agent.config.branch,
            "tests_passed": all_passed,
            "test_results": test_results,
        }

        if not all_passed:
            agent.inject_system_message(
                f"Test results (some failed): {json.dumps(test_results)}\n"
                "Please fix the failing tests and submit again.",
            )
            return json.dumps({"status": "tests_failed", "results": test_results})

        supervisor_id = agent.config.supervisor_id
        if supervisor_id:
            target = registry.get(supervisor_id)
            if target:
                msg = Message(
                    from_id=agent.uuid,
                    to_id=supervisor_id,
                    content=json.dumps(report),
                )
                target.enqueue_message(msg)

        event_bus.emit(
            Event(
                type=EventType.AGENT_TERMINATED,
                agent_id=agent.uuid,
                data=report,
            ),
        )

        logger.info(
            "Agent {} submitted result (tests={})",
            agent.uuid[:8],
            "pass" if all_passed else "fail",
        )
        agent.request_termination("Work submitted successfully")
        return json.dumps({"status": "submitted", "tests_passed": True})
