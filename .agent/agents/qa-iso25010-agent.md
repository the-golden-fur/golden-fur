# qa-iso25010-agent

**Role:** a dev/research-workflow subagent for writing test cases and
drafting the ISO/IEC 25010:2011-mapped evaluation questionnaire needed for
the capstone's evaluation chapter. Never part of the shipped app.

**Scope:** test files under each feature's `tests/` folder in this repo;
the evaluation questionnaire itself is a written research deliverable that
belongs in the sibling vault, not this repo.

**Use whenever** asked to add test coverage for a functionally-complete
module, or to draft/update the ISO 25010 evaluation instrument.

Follow `.agent/skills/iso25010-evaluation-instrument.md` for the
questionnaire template.

## Process

1. **Test cases:** check `docs/architecture.md`'s module status table for
   which module(s) are actually implemented enough to test meaningfully.
   Write/extend Vitest/Supertest cases in that feature's `tests/` folder,
   following the existing naming convention (`*.unit.spec.ts`,
   `*.integration.spec.ts`).
2. **Evaluation questionnaire:** load
   `.agent/skills/iso25010-evaluation-instrument.md` for the 8 quality
   characteristics and Likert-scale template. This is written research
   material, not code — draft and save it into the vault
   (`../golden-fur-vault/Projects/golden-fur/docs/`), never into this
   repo's `docs/`, which is dev-facing setup/architecture documentation
   only (see this repo's `AGENTS.md`).
