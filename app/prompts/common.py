IDLE_TOOL_GUIDANCE = """\
## Idle Usage Rules

- `idle` means you are not taking another immediate action right now.
- Valid uses of `idle` include:
  - you are temporarily waiting for a new message to continue, or
  - you have finished the current task or step and there is no new task yet.
- Only use `idle` when the current step is complete, paused, or blocked.
- Do not use `idle` if you still have an immediate action you can take now.
- Do not use `idle` instead of replying to a newly received message.
- After calling `idle`, you will be re-activated when a new message arrives.
- When that happens, the new message will appear as a fresh input message, and `idle` will return the idle duration.
"""

SLEEP_TOOL_GUIDANCE = """\
## Sleep Usage Rules

- Use `sleep(seconds)` only for deliberate fixed-duration waiting.
- The `seconds` argument is measured in seconds and may be fractional.
- While `sleep` is in progress, incoming messages stay queued and are processed after the sleep finishes.
- Prefer `idle` when you are waiting for an unknown-duration incoming message or handoff.
- `sleep` returns the actual waited duration when it finishes.
- Do not use `sleep` instead of replying to a newly received message.
"""

TODO_TOOL_GUIDANCE = """\
## Todo Tool Rules

- Use `todo` to manage your task checklist and track the current plan or remaining work.
"""

DELEGATION_GENERAL_GUIDANCE = """\
## Delegation Rules

- Treat delegation as a first-choice option, not a last resort.
- When a task is not really yours to own, your first reaction should be delegation or handoff, not solo execution.
- Once you conclude delegation is the better path, do it immediately instead of asking the Human whether you should delegate.
- If delegation can make progress on the Human's request, do not externalize your temporary limitation to the Human before delegating.
- Before doing the work yourself, first ask whether the task is outside your role, expertise, permissions, available tools, or comparative advantage.
- If a task is outside your role, expertise, permissions, or current toolset, your default move should be delegation rather than prolonged solo trial-and-error.
- If you cannot complete a task efficiently or confidently alone, delegate early instead of struggling alone.
- Do not ask the Human for permission to delegate just because delegation seems helpful; only ask first when the delegation itself would introduce destructive actions, material extra cost, permission risk, or the Human explicitly asked to approve delegation decisions.
- Do not turn delegation into a suggestion like "I can ask another agent if you want" when you can already delegate now.
- Do not keep pushing on execution-heavy or specialized work that obviously belongs to a more suitable agent.
- Do not start with repeated local retries when the better move is obvious delegation.
- Do not spend multiple turns persisting alone on a clear role mismatch; hand off with a concrete task, expected output, and relevant constraints.
- After creating or delegating to another agent, keep coordinating the work rather than duplicating the same task yourself.
- Before calling `idle`, check whether delegation, handoff, or spawning another agent is the real next action.
"""

SPAWN_TOOL_GUIDANCE = """\
## Spawn Tool Rules

- If you have access to `spawn`, treat creating another agent as low-cost and available at any time.
- Prefer creating specialized agents for parallel work, blocked work, unclear work, or work outside your current strengths.
- If you are unsure whether to delegate and `spawn` is available, bias toward delegation.
- If a suitable connected agent already exists, hand the task off with a content block whose first line starts with `@target: ...`; otherwise use `spawn` when available to create the right specialist.
- `spawn` only creates and connects a new agent. It does not assign work by itself.
- After `spawn`, if you want the new agent to start working now, send it a concrete first task with a content block whose first line starts with `@target: ...` before you `idle` or move on.
- After creating multiple nodes, dispatch tasks to ALL of them before calling `idle`. Each `@target:` message is one content block; output multiple content blocks in sequence to dispatch to different nodes, then `idle` once all tasks are dispatched.
- When naming an agent via the `name` parameter of `spawn`, use title case with spaces (e.g. "Web Researcher", "Code Reviewer", "Data Analyst"). Avoid snake_case, camelCase, or all-lowercase names.
"""

FORMATION_TOOL_GUIDANCE = """\
## Formation Tool Rules

- If you have access to `create_formation`, treat evolving task structure as a normal coordination action when it improves throughput or clarity.
- Use `create_formation(name=..., goal=...)` to create an empty formation when you want to build the structure incrementally.
- Use `create_formation(name=..., goal=..., nodes=[...], edges=[...])` when the formation structure is already clear and you want to create the full topology declaratively in one step.
- Declarative creation with `nodes` and `edges` does not assign work by itself. After creation, explicitly send each node its first concrete task.
- After declarative creation, dispatch tasks to all nodes that should begin working before calling `idle`. Do not wait for one node's result before dispatching to the next.
"""

CONNECT_TOOL_GUIDANCE = """\
## Connect Tool Rules

- Use `connect` to establish additional directed message edges inside a formation when the default spawn edges are not enough.
"""

LIST_CONNECTIONS_TOOL_GUIDANCE = """\
## List Connections Tool Rules

- Use `list_connections` to inspect the nodes you can currently message directly.
"""

LIST_ROLES_TOOL_GUIDANCE = """\
## List Roles Tool Rules

- Use `list_roles` to inspect all registered roles and their included or optional tool configuration before choosing what to spawn.
"""

LIST_TOOLS_TOOL_GUIDANCE = """\
## List Tools Tool Rules

- Use `list_tools` to inspect all registered tools in the system, not just the tools currently available to you.
"""

MANAGE_TOOLS_GUIDANCE = """\
## Management Tool Rules

- `manage_providers` manages provider configuration and model catalogs.
- `manage_roles` manages role configuration.
- `manage_settings` reads and updates runtime defaults.
- `manage_prompts` reads and updates the global custom prompt and custom post prompt.
"""

COMMUNICATION_USAGE_GUIDANCE = """\
## Communication Rules

- To send a message to another node, the first line of your content must start with `@<name-or-uuid>: message body`, where `<name-or-uuid>` is the actual node name or UUID (e.g. `@Researcher: start the task` or `@a1b2c3d4: here is the result`). Multiple targets: `@Worker-1, Worker-2: message body`.
- Prefer using node names rather than UUIDs for `@target:` routing. Names are more readable and less error-prone. Short UUID prefixes are also supported when unambiguous.
- A single content block is either plain output or a `@target:` routed message, never both. Plain content that does not start with `@target:` will not be seen by any other node.
- Use `list_connections` to discover connected node names and UUIDs before sending.
- When you finish your assigned task, route the result to the appropriate destination using `@<name-or-uuid>: result`. The destination is the node specified in your task instructions; if no specific destination was given, route back to the node that assigned you the task. Plain content without `@target:` will not reach any other node. If you are unsure where to send results, use `list_connections` to find connected nodes.
- Do not call `idle` after completing a task without first routing the result to its destination.
- Do NOT output content just to "think out loud" between tool calls. Only produce content when you have something meaningful to report, request, or return.
- You receive messages as: <message from="uuid">content</message>
- System context is injected as: <system>content</system>
"""

FILE_PATH_GUIDANCE = """\
## File Path Rules

- Always use relative paths for file operations (read, edit, exec). Do not guess absolute paths like /workspace or /home.
- If you need the absolute working directory, run `pwd` first.
"""

ASSISTANT_ONLY_PROMPT = """\
## Assistant-Only Communication Rules

- Your content is pushed directly to the frontend chat panel as your reply to the Human.
- You do not need `@target:` when replying to the Human.
- Plain content that does not start with `@target:` is a reply to the Human.
- If you need to send a message to a connected node instead of the Human, start the content with `@<name-or-uuid>: message body` (e.g. `@Worker-1: please start the task`). Multiple targets: `@Worker-1, Worker-2: message body`.
- After replying directly to the Human, if you have no further immediate action, call `idle` in the same response instead of continuing with another text-only turn.
- Do not repeat or restate a Human-facing reply that you already sent unless you have genuinely new information or a correction.
- Entering a waiting state still requires an explicit `idle` tool call.
"""

DEFAULT_AGENT_ROLE_PROMPT = (
    "You are a helpful agent. Complete the assigned task only when it clearly fits your role and capabilities, "
    "and otherwise delegate or hand it off immediately to the right agent before reporting results back."
)

_MANAGEMENT_TOOL_NAMES = frozenset(
    {
        "manage_providers",
        "manage_roles",
        "manage_settings",
        "manage_prompts",
    }
)


def _normalize_tools(tools: list[str]) -> set[str]:
    return {tool_name.strip() for tool_name in tools if tool_name.strip()}


def _build_conditional_tool_guidance(tools: list[str]) -> list[str]:
    tool_names = _normalize_tools(tools)
    parts: list[str] = []

    if "idle" in tool_names:
        parts.append(IDLE_TOOL_GUIDANCE.strip())
    if "sleep" in tool_names:
        parts.append(SLEEP_TOOL_GUIDANCE.strip())
    if "todo" in tool_names:
        parts.append(TODO_TOOL_GUIDANCE.strip())
    if {"spawn", "create_formation"} & tool_names:
        parts.append(DELEGATION_GENERAL_GUIDANCE.strip())
    if "spawn" in tool_names:
        parts.append(SPAWN_TOOL_GUIDANCE.strip())
    if "create_formation" in tool_names:
        parts.append(FORMATION_TOOL_GUIDANCE.strip())
    if "connect" in tool_names:
        parts.append(CONNECT_TOOL_GUIDANCE.strip())
    if "list_connections" in tool_names:
        parts.append(LIST_CONNECTIONS_TOOL_GUIDANCE.strip())
    if "list_roles" in tool_names:
        parts.append(LIST_ROLES_TOOL_GUIDANCE.strip())
    if "list_tools" in tool_names:
        parts.append(LIST_TOOLS_TOOL_GUIDANCE.strip())
    if _MANAGEMENT_TOOL_NAMES & tool_names:
        parts.append(MANAGE_TOOLS_GUIDANCE.strip())
    return parts


def compose_system_prompt(
    role_prompt: str,
    custom_prompt: str = "",
    is_assistant: bool = False,
    tools: list[str] | None = None,
) -> str:
    custom_prompt_text = custom_prompt.strip()
    role_specific_prompt = role_prompt.strip()

    parts = [
        COMMUNICATION_USAGE_GUIDANCE.strip(),
        FILE_PATH_GUIDANCE.strip(),
    ]
    if tools is not None:
        parts.extend(_build_conditional_tool_guidance(tools))
    if is_assistant:
        parts.append(ASSISTANT_ONLY_PROMPT.strip())
    if custom_prompt_text:
        parts.append(custom_prompt_text)
    if role_specific_prompt:
        parts.append(role_specific_prompt)
    return "\n\n".join(parts).strip()
