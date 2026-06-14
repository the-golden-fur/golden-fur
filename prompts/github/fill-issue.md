# INPUT:

<!-- Paste the issue template form fields below (copy from
.github/ISSUE_TEMPLATE/\*.yml or from the GitHub new issue form).
Then describe your issue in plain text underneath it.
//
Example:
//
TEMPLATE: 1-feature-request.yml
//
TEXT:
We need a way for receptionists to see which cages are available
before confirming a hotel booking. Right now they have to check
a physical whiteboard which causes overbooking errors. -->

---

# INSTRUCTIONS:

1. Identify the issue template type from the filename or form fields
   (feature request, bug report, or task/chore).
2. Read the plain text description provided.
3. Fill in every field of the template using the description as source
   material, following the field-filling rules below.
4. Generate a correctly formatted issue title following the title rules.
5. Output the fully filled issue ready to paste into GitHub.

---

# RULES:

## Title Format

Match the template's title pattern exactly:

- Feature request: `feat(<scope>): <short description>`
- Bug report: `fix(<scope>): <short description>`
- Task / chore: `<type>(<scope>): <short description>`

Title rules:

- Use imperative mood — "add" not "added"
- Max 72 characters
- No period at the end
- Choose scope from the template's Scope dropdown options

## Dropdown Fields

- Select the single most appropriate option from each dropdown
- For Severity (bug reports): choose based on impact described in text
- For Sprint: default to `Backlog` unless the text specifies otherwise
- For Type (tasks): choose the closest matching type

## Textarea Fields

### User Story (feature requests)

- Format strictly: `As a [user type], I want [goal] so that [reason].`
- Infer the user type from context (e.g. receptionist, admin, vet)
- Keep it one sentence

### Acceptance Criteria (feature requests)

- Write 3–5 concrete, testable conditions as a checkbox list
- Each item must be verifiable — avoid vague language like "works well"
- Format: `- [ ] Condition`

### Description (bug reports and tasks)

- Bug reports: state Expected vs Actual behavior clearly
- Tasks: describe what needs to be done and why, concisely

### Steps to Reproduce (bug reports)

- Number each step
- Be specific enough that someone else can reproduce it exactly
- End with the visible error or unexpected result

### Definition of Done (tasks)

- Write 2–4 checkbox items that confirm completion
- Each item must be concrete and verifiable

### Additional Context

- Include only if the input text contains extra details, links,
  or dependencies worth preserving
- Skip if nothing relevant is in the input text

## Checkboxes

- All required checkboxes must be marked checked: `[x]`
- Optional checkboxes: leave unchecked unless the input confirms them

## What to Infer vs What to Leave Blank

- Infer: title, scope, type, severity, sprint (default Backlog),
  user story, acceptance criteria, steps, description
- Leave blank: screenshots, logs, node version, browser
  (unless the input text explicitly provides them)

---

# OUTPUT FORMAT:

Feature request example:

```
Title: feat(appointments): add real-time cage availability to booking

Scope: Appointments
Sprint: Backlog

User Story:
As a receptionist, I want to see live cage availability before
confirming a hotel booking so that I can prevent overbooking errors
without checking the physical whiteboard.

Acceptance Criteria:
- [ ] Cage availability is displayed on the booking form in real time
- [ ] Booking confirmation is blocked if no cages are available for
      the selected size category
- [ ] Availability updates immediately when another booking is made
- [ ] Works correctly across both Makati and Southwoods branches

Additional Context:
N/A

Pre-submission Checklist:
[x] I searched existing issues and this feature hasn't been requested.
[x] This feature aligns with the Golden Fur project scope.
```

Bug report example:

```
Title: fix(appointments): cage count not updating after cancellation

Scope: Appointments
Severity: High — major feature is broken
Sprint: Backlog

What happened?
Expected: Available cage count increases when a hotel booking is
          cancelled with proper notice.
Actual:   Cage count stays the same after cancellation, causing
          the system to block new bookings even when cages are free.

Steps to Reproduce:
1. Create a hotel booking for a Large cage
2. Cancel the booking with more than 4 days notice
3. Attempt to create a new Large cage booking for the same dates
4. Observe that the system reports no cages available

Pre-submission Checklist:
[x] I searched existing issues and this bug hasn't been reported yet.
[x] I can reproduce this bug consistently.
```

Task example:

```
Title: refactor(billing): extract daycare fee logic into utility

Task Type: refactor — code restructuring without feature or fix
Scope: Dashboard
Sprint: Backlog

Description:
Daycare fee calculation logic is currently duplicated across three
controllers. It should be extracted into a shared utility function
to make it easier to update the rate structure in one place.

Definition of Done:
- [ ] Fee calculation logic lives in a single utility function
- [ ] All three controllers import from the utility
- [ ] Existing Vitest tests still pass with no changes to test logic
- [ ] No change in calculated output for any existing test case

Pre-submission Checklist:
[x] This task is small enough to complete within one sprint.
[x] I've confirmed no existing issue already covers this work.
```
