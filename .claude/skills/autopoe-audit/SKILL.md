---
name: autopoe-audit
description: Audit whether a specified spec commit, module, or behavior is truly aligned in /project/autopoe, then implement or repair any drift. Use when the user points to the area that may be misaligned, and Claude Code should do the investigation, analysis, planning, and repair work.
disable-model-invocation: true
---

# Autopoe Audit

Use this skill in `/project/autopoe` when the user points to a spec area that may not be aligned and wants the AI to carry the audit and repair process.

## Core rules

- Read `/project/autopoe/CLAUDE.md` first for repository-local constraints.
- Start from the user-specified audit target, not from the next pending commit.
- The user only needs to identify the suspected misaligned area. You are responsible for the rest: reading the target spec material, comparing it against code, planning repairs, implementing them, and reviewing the result.
- When the audit target maps to one or more spec commits, read the corresponding `CHANGE.md` files to recover the original intent, but do not treat them as authoritative over the actual spec modules.
- Compare the target spec material against both the current implementation and any relevant adjacent spec modules.
- If the audit shows that changes are needed, do not start implementing immediately. First present the intended repair plan to the user in user-friendly language and wait for explicit confirmation.
- Once the user confirms, carry the repair through within the current task instead of stopping at analysis.
- Do not advance `refs/autopoe-spec/aligned` by default. Advance it only when you have explicitly confirmed that the whole chain from the current aligned pointer through the audited target is now aligned.
- Only ask the user follow-up questions when the spec itself leaves a real design ambiguity.
- Use behavior-oriented, user-friendly wording when explaining audit findings or repair plans. Avoid file-level or implementation-level framing unless the user is clearly operating at that technical level.

## Workflow

1. Run `git fetch spec`.
2. Identify the exact audit target from the user's pointer:
   - spec commit
   - spec module
   - concrete behavior described by the user
3. Read the target spec material, the relevant `CHANGE.md` file or files when applicable, plus nearby modules needed for context.
4. Compare it against the current code in `/project/autopoe`.
5. Classify the result into:
   - already aligned
   - partially aligned
   - misaligned
   - blocked by unclear spec
6. If the result is already aligned, report that directly in user-friendly language and stop unless the user asks for more.
7. If repair is needed and the path is clear, present:
   - what currently behaves incorrectly or incompletely
   - what you plan to change
   - what effect the user should expect after the fix
8. Wait for the user to explicitly confirm the repair direction.
9. Once confirmed, implement the missing or incorrect behavior.
10. Review the repaired result from the actual impact surface and fix any additional drift you find.
11. If repository files changed, commit with a normal implementation-focused Conventional Commit subject.
12. Advance `refs/autopoe-spec/aligned` only if the full commit chain through the audited target is now confirmed aligned.
13. Report what was audited, what was already aligned, what was repaired, and whether the aligned pointer moved.
