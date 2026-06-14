# INPUT:

<!-- Provide the following:
Branch name: feat/cage-availability-tracking
Target branch: main (or dev if applicable)
Summary of change: what you did and why
Key implementation details (for the How section)
Testing done:
Related issue(s): #18
Milestone: e.g. Sprint 2 — Appointment Booking -->

---

# INSTRUCTIONS:

1. Generate a PR title following the title rules below.
2. Generate the full PR body using the required sections below.
3. Recommend the appropriate label(s).
4. Output the Milestone and Development fields separately — these are
   GitHub GUI fields set outside the PR body, not written into it.
5. Generate a merge commit message to be used when squash-merging
   the PR into the target branch.

---

# RULES:

## General Rules

- PRs must be atomic — one concern per PR
- Target `main` for all work (skipping `dev` for this template repo)
- Request at least one reviewer before merging
- Do not merge your own PR without a review except in emergencies

## GitHub GUI Fields (set outside the PR body)

### PR Title

- Mirrors the commit subject line format: `<type>(<scope>): <subject>`
- Max 72 characters
- Imperative mood, no period at the end
- Must be specific enough to understand the change at a glance

### Labels

Use one or more:

- `feature` → new functionality
- `bug` → bug fix
- `hotfix` → urgent production fix
- `chore` → maintenance, dependencies, config
- `refactor` → structural change, no behavior change
- `docs` → documentation only
- `test` → test additions or changes
- `breaking` → includes a breaking change

### Milestone

- Maps to the GitHub Milestone field in the PR sidebar
- Format: `<Sprint name> — <focus area>`
- Example: `Sprint 2 — Appointment Booking`
- Use `Backlog` if not assigned to a sprint

### Development (Linked Issues)

- Maps to the GitHub Development field in the PR sidebar
- Format: `Closes #<issue>`
- List one issue per line if multiple

### Merge Commit Message (for squash merge)

- Format: `<type>(<scope>): <subject> (#<PR number>)`
- Used when squash-merging to keep a clean linear history on `main`
- The PR number links the merge commit back to the full discussion

## PR Body Sections

The project uses `.github/PULL_REQUEST_TEMPLATE.md` — GitHub will
pre-fill the body when you open a PR. Fill in each section:

### Summary

- One sentence covering both what and why
- Written for someone scanning a list of PRs

### What Changed

- Brief bullet list of key files or components touched and why
- Not exhaustive — focus on what matters to a reviewer

### What

- One sentence: what does this PR introduce or change?
- Focus on the outcome, not the implementation

### Why

- One sentence: what problem does this solve?
- This is the motivation — why this work was needed now

### How

- Bullet list of key implementation decisions and trade-offs
- This is the section that differs from a commit body:
  PRs include How because reviewers need implementation context
  before they can approve — commit bodies do not include How
  because the code already shows it
- Do not list every file changed — list decisions, not a file index

### Testing

- Describe how the change was verified
- Include manual steps, automated tests, or both
- Mention edge cases tested if relevant

---

## OUTPUT FORMAT

### PR TITLE

feat(booking): add real-time cage availability tracking

### BASE BRANCH

main

### COMPARE BRANCH

feat/cage-availability-tracking

### LABELS

feature

### MILESTONE

Sprint 2 — Appointment Booking

### DEVELOPMENT

Closes #18

### PR BODY

```
## Summary

Adds live cage availability checks at booking confirmation to prevent
overbooking when all cages for a given size category are occupied.

## What Changed

- `cageAvailability.ts` — new service that queries cage occupancy
- `BookingPage.tsx` — calls availability check before confirming

## Screenshots / Demo

<!-- Delete this section if not applicable -->

---

## What

This PR introduces a real-time cage availability check at the booking
confirmation step so receptionists can no longer double-book cages.

## Why

Receptionists had no visibility into cage occupancy before confirming
a hotel booking, causing manual overbooking errors across both branches.

## How

- Availability is checked server-side at confirmation time, not on page
  load, to avoid stale reads from concurrent bookings
- The check is scoped to size category (Small / Medium / Large) rather
  than individual cage IDs to match how receptionists think about capacity

## Testing

- Manually verified that a booking confirmation is blocked when all
  cages of the selected size are occupied
- Tested concurrent booking scenario by opening two sessions and
  confirming from both — second confirmation correctly shows no cages

---

## Pre-Merge Checklist

- [ ] Synced with `main` before opening this PR (`git fetch origin && git merge origin/main`)
- [ ] All tests pass locally (`npm test` in both `client/` and `server/`)
- [ ] No `console.log` left in production code
- [ ] Self-reviewed my own diff before requesting review
- [ ] Added or updated tests for the changes made
- [ ] No new ESLint errors (`npm run lint`)
```

### MERGE COMMIT MESSAGE

feat(booking): add real-time cage availability tracking (#42)
