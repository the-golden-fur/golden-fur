# INPUT:

<!-- Describe what you changed and why.
The more context you give, the better the body will be.
If no code or changes are provided, assume the prompt is asking you to create them.
Group atomic, related changes for the current prompt.
Output a directory structure using ASCII characters showing folders,
and added, modified, deleted files (include sample output too).

Examples:
feat(booking): add real-time cage availability check before confirming hotel bookings
fix(billing): daycare fee calculates incorrectly for sessions over 3 hours
chore: bump prisma from 5.9 to 5.10 to fix a type generation bug
refactor(pricing): move tiered pricing logic out of controller into utility -->

---

# INSTRUCTIONS:

1. Write a commit subject line following the subject line rules below.
2. Decide if a body is needed (see when-to-add-a-body below).
3. If a body is needed, write it following the body rules below.
4. Add a footer if there are issue references or breaking changes.
5. Output the full commit message ready to paste into a git editor.
6. Output an ASCII directory structure showing only affected files:
   - `added`, `modified`, `deleted`, or `renamed`.
7. Output the actual changed/added files as artifacts or file attachments
   so the developer can copy or download them directly without
   digging through the chat. Deleted files do not need an artifact.

---

# RULES:

## Subject Line

- Format: `<type>(<scope>): <subject>`
- Use imperative mood — "add" not "added", "fix" not "fixed"
- Max 50 characters
- No period at the end
- Scope is optional but recommended
- Common types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`,
  `perf`, `ci`, `style`, `revert`

## When to Add a Body

- Skip the body for trivial or self-explanatory changes
  (e.g., `chore: update .gitignore`, `docs: fix typo in README`)
- Add a body when:
  - The reason for the change is not obvious from the subject
  - The change has meaningful context that helps future readers
  - A bug fix needs to describe what behavior was wrong
  - A refactor needs to explain why the restructuring was done

## Body Rules

- WHAT: describe what the change does at a high level
- WHY: explain the motivation — the problem, the context, the reason
- HOW is intentionally excluded
- Separate body from subject by ONE blank line
- Wrap lines at 72 characters
- Write in plain prose — not bullet points

## Footer Rules

- Separated from body by ONE blank line
- Issue references: `Closes #42`, `Fixes #18`, `Refs #7`
- Breaking change: `BREAKING CHANGE: <what broke and what to do>`
- Co-author: `Co-authored-by: Name <email@example.com>`

## Breaking Changes

- Add `!` after type/scope: `feat(api)!: rename bookings endpoint`
- Add `BREAKING CHANGE:` footer with migration instructions
- Use both for maximum tooling and changelog compatibility

## File Artifacts

- Every file that is added or modified must be output as a separate
  artifact or file attachment so the developer can copy or download it.
- Each artifact should contain only that one file's full contents.
- Deleted files do not need an artifact — the directory structure
  annotation (`deleted`) is sufficient.
- Label each artifact clearly with its repo-relative path
  (e.g., `client/.env.example`).

---

# OUTPUT FORMAT:

```
feat(booking): add real-time cage availability tracking

Receptionists currently have no visibility into which cages are
occupied before confirming a hotel booking, causing manual
overbooking errors across both branches.

This change introduces live cage status checks at booking confirmation
so the system prevents double-booking when all cages for a given
size category are already occupied.

Closes #18
```

```
Directory Structure:

project-root/
├─ src/
│  ├─ services/
│  │  └─ cageAvailability.ts (added)
│  ├─ hooks/
│  │  └─ useCageAvailability.ts (added)
│  └─ pages/
│     └─ BookingPage.tsx (modified)
├─ api/
│  └─ bookingController.ts (modified)
```

[artifact: src/services/cageAvailability.ts]
[artifact: src/hooks/useCageAvailability.ts]
[artifact: src/pages/BookingPage.tsx]
[artifact: api/bookingController.ts]

---

**For a trivial change (no body needed):**

```
chore(deps): update prisma orm to v5.10
```

```
Directory Structure:

project-root/
├─ package.json (modified)
└─ package-lock.json (modified)
```

[artifact: package.json]

---

**For a breaking change:**

```
feat(api)!: rename /bookings endpoint to /appointments

The previous endpoint name was inconsistent with the rest of the API
surface and caused confusion during onboarding for new developers.

BREAKING CHANGE: /api/bookings is now /api/appointments.
Update all client-side fetch calls and API documentation accordingly.
```

```
Directory Structure:

project-root/
├─ src/
│  ├─ routes/
│  │  └─ bookings.ts -> appointments.ts (renamed)
│  ├─ controllers/
│  │  └─ appointmentController.ts (modified)
│  └─ api/
│     └─ index.ts (modified)
```

[artifact: src/routes/appointments.ts]
[artifact: src/controllers/appointmentController.ts]
[artifact: src/api/index.ts]
