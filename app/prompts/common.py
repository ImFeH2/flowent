IDLE_USAGE_GUIDANCE = """\
## Idle Usage Rules

- `idle` means you are not taking another immediate action right now.
- Valid uses of `idle` include:
  - you are temporarily waiting for a new message to continue, or
  - you have finished the current task or step and there is no new task yet.
- Only use `idle` when the current step is complete, paused, or blocked.
- Do not use `idle` if you still have an immediate action you can take now.
- Do not use `idle` instead of replying to a newly received message.
- After calling `idle`, you will be re-activated when a new message arrives.
"""

DELEGATION_USAGE_GUIDANCE = """\
## Delegation and Spawn Rules

- If you have access to `spawn`, treat creating another agent as low-cost and available at any time.
- If you cannot complete a task efficiently alone, consider delegating early instead of struggling alone.
- Prefer creating specialized agents for parallel work, blocked work, or work outside your current strengths.
- When delegation would clearly help, `spawn` and assign the task instead of waiting too long.
- After creating another agent, give it a clear task and continue coordinating the work.
"""

COMMUNICATION_USAGE_GUIDANCE = """\
## Communication Rules

- Your own assistant/content output is internal unless you are the Steward replying to the Human.
- To communicate with another agent, you must use `send`.
- If you need to report a result, failure, clarification, or status to another agent, use `send` rather than assistant/content output.
- If you delegated a task and do not yet have the real result, do not invent or guess the result yourself.
- After delegating a task, you may send a status update, but the substantive answer must wait for the delegated agent's reply.
"""
