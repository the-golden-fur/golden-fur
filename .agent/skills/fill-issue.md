# Fill issue

**Use whenever** asked to turn a plain-text description into a filled-out
GitHub issue — a feature request, bug report, or task/chore.

## Process

1. Identify the template type from the filename/form fields provided, or
   from context (feature request, bug report, task/chore).
2. Fill every field using the rules below.
3. Open it directly: `gh issue create --title "..." --body "..." --label
"..."`, matching the body structure of the repo's own
   `.github/ISSUE_TEMPLATE/*.yml` (User Story / Acceptance Criteria for
   features, Expected vs Actual + Steps to Reproduce for bugs, Description
   - Definition of Done for tasks). If a required field can't be confidently
     inferred from the input, ask rather than guessing.

## Rules

### Title format

Matches the template's title pattern: `feat(<scope>): ...` (feature),
`fix(<scope>): ...` (bug), `<type>(<scope>): ...` (task). Imperative mood,
max 72 characters, no trailing period, scope from the template's dropdown.

### Dropdown fields

Pick the single most fitting option per dropdown. Severity (bugs): infer
from described impact. Sprint: default `Backlog` unless specified. Type
(tasks): closest match.

### Textarea fields

- **User Story** (features) — strictly `As a [user type], I want [goal] so
that [reason].`, one sentence; infer user type from context.
- **Acceptance Criteria** (features) — 3–5 concrete, testable checkbox
  items (`- [ ] ...`); avoid vague language like "works well".
- **Description** (bugs/tasks) — bugs: Expected vs Actual behavior; tasks:
  what needs doing and why, concisely.
- **Steps to Reproduce** (bugs) — numbered, specific enough to reproduce
  exactly, ending with the visible error/unexpected result.
- **Definition of Done** (tasks) — 2–4 concrete, verifiable checkbox items.
- **Additional Context** — only if the input has extra details/links/deps
  worth preserving; otherwise omit.

### Checkboxes

Required pre-submission checkboxes get checked (`[x]`); optional ones stay
unchecked unless the input confirms them.

### Infer vs. leave blank

Infer: title, scope, type, severity, sprint (default Backlog), user story,
acceptance criteria, steps, description. Leave blank unless explicitly
given: screenshots, logs, node version, browser.
