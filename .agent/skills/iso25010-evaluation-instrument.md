# ISO/IEC 25010 evaluation instrument

**Purpose:** a template for drafting the Likert-scale questionnaire mapped
to ISO/IEC 25010's 8 quality characteristics, for the capstone's written
evaluation deliverable. Supports the research/documentation side of the
capstone rather than the shipped app — most useful once modules are
functionally complete enough to evaluate, and especially near defense
time.

**This is a research deliverable, not code.** Draft and save it into the
vault (`../golden-fur-vault/Projects/golden-fur/docs/`), never into this
repo's `docs/`, which is dev-facing setup/architecture documentation only.

**Use whenever** drafting or updating the evaluation questionnaire, or
mapping a specific system behavior to one of the 8 characteristics for the
evaluation chapter.

## The 8 ISO/IEC 25010 quality characteristics

1. **Functional Suitability** — completeness, correctness, and
   appropriateness of the functions for the specified tasks (e.g. does
   booking capture what the business actually needs).
2. **Performance Efficiency** — time behavior, resource utilization,
   capacity under expected load.
3. **Compatibility** — co-existence with other systems, interoperability
   (e.g. PayMongo, OAuth providers).
4. **Usability** — recognizability, learnability, operability,
   accessibility, user error protection — relevant across the 8 staff
   roles and the customer portal, which have very different usability
   needs.
5. **Reliability** — maturity, availability, fault tolerance,
   recoverability.
6. **Security** — confidentiality, integrity, non-repudiation,
   accountability, authenticity — directly evaluable against the RBAC/MFA
   work (`rbac-totp-setup.md`).
7. **Maintainability** — modularity, reusability, analyzability,
   modifiability, testability — the feature-folder convention and test
   coverage are concrete evidence here.
8. **Portability** — adaptability, installability, replaceability.

## Questionnaire template

For each characteristic, a short block:

```markdown
### <Characteristic name>

<1–2 sentence plain-language explanation of what this is asking about, for
a non-technical respondent (e.g. branch staff, the client).>

| # | Statement | 1 (Strongly Disagree) | 2 | 3 | 4 | 5 (Strongly Agree) |
|---|-----------|:--:|:--:|:--:|:--:|:--:|
| 1 | <statement tailored to this system, phrased as a positive claim> | | | | | |
| 2 | ... | | | | | |
```

- 3–5 statements per characteristic is typical — enough to triangulate,
  not so many respondents fatigue.
- Phrase every statement as a positive claim ("The booking system prevents
  double-bookings reliably") so scoring direction stays consistent across
  the whole instrument — never mix positively- and negatively-phrased
  items without flagging which is which.
- Tailor statements to what's actually implemented (check
  `docs/architecture.md`'s module status table) — don't write evaluation
  statements for a Planned module as if it were shipped.

## Respondent framing

Consider separate short instruments (or a respondent-type field) for staff
vs. customers vs. the client/adviser, since Usability and Functional
Suitability in particular will read very differently across those groups.
