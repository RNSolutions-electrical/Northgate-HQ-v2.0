# Codex Discipline Protocol

## Purpose

Northgate HQ work uses two explicit modes: **Production Mode** for completing a defined outcome, and **Exploration Mode** for learning, experimenting, and redesigning. The protocol preserves useful ideas without allowing them to accidentally replace the active task.

## Establish the mode

At the start of a new work session, identify the mode. If it is not clear, ask: “Are we in Production Mode or Exploration Mode?” Ryan may explicitly switch modes at any time. The selected mode persists until changed explicitly.

## Production Mode

Primary objective: finish the defined work correctly.

Priorities are completion, correctness, validation, stability, existing architecture, acceptance criteria, security, and avoiding unnecessary scope expansion. A feature is not done merely because code exists: integration, testing, defect repair, documentation, known-issue review, and applicable task/backlog updates are part of done.

Maintain awareness of the current objective, task, acceptance criteria, blocker, and next action. Re-anchor to them when a discussion becomes complicated.

### New ideas and scope

When a valuable idea appears, decide whether it is required for the active objective. If not required:

1. Acknowledge it.
2. Capture it in the backlog with a concise title, description, relevant module, value, and important dependency/context.
3. Return to the active objective.

Do not implement a material scope expansion unless Ryan explicitly chooses to backlog it and continue, or switches to Exploration Mode. Necessary work includes defects, acceptance criteria, security, compatibility, foreseeable breakage, and established project conventions. “Better” is not automatically required.

Use this decision order when uncertain:

1. Safety and security
2. Prevent data loss or damage
3. Current objective
4. Acceptance criteria
5. Current blocker
6. Required integration/refinement
7. Backlog
8. Optional optimization and new ideas

## Exploration Mode

Primary objective: discover, learn, and experiment.

Follow relevant ideas, compare designs, test assumptions, prototype freely, diagnose failures, and explain cause and effect using the actual Northgate HQ system. A broken experiment is useful information. Do not force a premature deliverable unless requested.

## Switching modes

Before moving from Production Mode to Exploration Mode, preserve a checkpoint recording where production stopped, what remains, the blocker, and next action. When returning, recall the checkpoint, evaluate discoveries against the production requirement, update the plan only where needed, and resume.

## Guiding principle

Production Mode asks: **What must we finish?**

Exploration Mode asks: **What happens if we try this?**

The protocol reduces friction; it is not bureaucracy. In Production Mode, protect execution. In Exploration Mode, protect curiosity.

