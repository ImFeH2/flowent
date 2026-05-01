from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AssistantCommandDefinition:
    name: str
    description: str
    usage: str
    accepts_argument: bool = False


@dataclass(frozen=True)
class AssistantCommandInvocation:
    name: str
    argument: str = ""


class AssistantCommandError(ValueError):
    pass


@dataclass(frozen=True)
class ExecutedAssistantCommand:
    command_name: str
    feedback: str


COMMAND_DEFINITIONS: tuple[AssistantCommandDefinition, ...] = (
    AssistantCommandDefinition(
        name="/clear",
        description="Clear the current Assistant chat history.",
        usage="/clear",
    ),
    AssistantCommandDefinition(
        name="/compact",
        description="Compact the current execution context.",
        usage="/compact [focus]",
        accepts_argument=True,
    ),
    AssistantCommandDefinition(
        name="/help",
        description="Show the built-in Assistant commands and usage.",
        usage="/help",
    ),
)

COMMANDS_BY_NAME = {definition.name: definition for definition in COMMAND_DEFINITIONS}


def parse_assistant_command(content: str) -> AssistantCommandInvocation | None:
    stripped = content.lstrip()
    if not stripped.startswith("/"):
        return None

    parts = stripped.split(maxsplit=1)
    token = parts[0] if parts else stripped
    definition = COMMANDS_BY_NAME.get(token)
    if definition is None:
        return None

    argument = parts[1].lstrip() if len(parts) > 1 else ""
    if not definition.accepts_argument and argument.strip():
        raise AssistantCommandError(f"{definition.name} does not accept arguments")

    return AssistantCommandInvocation(
        name=definition.name,
        argument=argument if definition.accepts_argument else "",
    )


def build_assistant_help_text() -> str:
    lines = ["Built-in Assistant commands:", ""]
    for definition in COMMAND_DEFINITIONS:
        lines.extend(
            [
                f"`{definition.name}`",
                definition.description,
                f"Usage: `{definition.usage}`",
                "",
            ]
        )
    return "\n".join(lines).strip()


def execute_assistant_command_input(
    assistant: Any,
    content: str,
    *,
    interrupt_timeout: float = 5.0,
) -> ExecutedAssistantCommand | None:
    invocation = parse_assistant_command(content)
    if invocation is None:
        return None

    entry = assistant.execute_assistant_command(
        command_name=invocation.name,
        argument=invocation.argument,
        interrupt_timeout=interrupt_timeout,
    )
    return ExecutedAssistantCommand(
        command_name=entry.command_name,
        feedback=entry.content,
    )
