---
name: autopoe-align
description: Implement the next unaligned spec commit for /project/autopoe against the spec remote and local aligned ref. Use when the repository already has spec/main and refs/autopoe-spec/aligned configured, and Claude Code should carry the work autonomously from spec reading through implementation, review, commit, and aligned-ref advancement.
disable-model-invocation: true
---

# Autopoe Align

Use this skill in `/project/autopoe` when the task is to implement the next pending spec commit from the local `spec` remote with minimal user involvement.

## Core rules

- Read `/project/autopoe/CLAUDE.md` first for repository-local constraints.
- Treat `spec/main` as the design baseline source and `refs/autopoe-spec/aligned` as the current alignment pointer.
- Treat the target spec commit's `CHANGE.md` as required context for understanding that commit's intent, but never as a replacement for the actual spec modules.
- Work strictly in commit order. Do not skip ahead to a later spec commit unless the user explicitly switches to the audit skill.
- You are responsible for the full execution path: reading the spec commit, understanding the affected modules, planning, implementing, reviewing, committing, and advancing the aligned ref.
- If there is no next spec commit, do not invent work from chat context alone.
- Only interrupt the user when there is a real blocker or a genuine design ambiguity not already settled by the spec.
- After the work is done, summarize the outcome in user-friendly language as behavior change. Prefer “what now happens differently”, “what the user can now do”, and “what result is now correct or complete” over repository structure or internal technical detail unless the user is clearly discussing the project at a technical level.

## Workflow

1. Run `git fetch spec`.
2. Read the current alignment pointer with `git rev-parse refs/autopoe-spec/aligned`.
3. Compute the next pending spec commit with `git rev-list --reverse --max-count=1 refs/autopoe-spec/aligned..spec/main`.
4. If there is no result, report that the repo is already aligned to `spec/main` and stop unless the user asks for another task.
5. Read that spec commit's `CHANGE.md` and the relevant spec files.
6. Build the implementation plan yourself from the confirmed spec behavior, using `CHANGE.md` only as intent context.
7. Implement the change in `/project/autopoe`.
8. Review the changed behavior from the actual impact surface instead of doing a generic summary pass.
9. Fix any misalignment you find and re-check as needed.
10. Commit the repository change with a normal implementation-focused Conventional Commit subject.
11. Advance `refs/autopoe-spec/aligned` to the implemented spec commit.
12. Report the implemented spec commit, what changed, what was checked, and the updated aligned pointer.
13. End with a user-friendly behavior summary that explains what the code change accomplished in practice.
