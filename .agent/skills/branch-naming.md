# Branch naming & creation

**Use when** the user asks to start a branch — "start a branch for X",
"name a branch", "branch off dev". Also fine to run once, unprompted, when
you're about to make changes and the repo is sitting on `dev`/`main` (work
shouldn't land on the default branch). **Do not** create a branch _and_
commit to it as an end-of-task reflex — branch if needed, make the edits,
then stop and let the user ask for the commit (see `commit.md`).

## Process

1. Determine the branch type from the change description (table below).
2. Generate a name: `<type>/<short-description>` — lowercase, hyphens only,
   no spaces/underscores/extra slashes, 2–5 words, specific enough to
   identify the work at a glance.
3. Pick the base branch: `hotfix/` branches from `main`; every other type
   branches from `dev`.
4. Run the branch creation directly:
   ```
   git checkout <base>
   git pull origin <base>
   git checkout -b <type>/<short-description>
   git push -u origin <type>/<short-description>
   ```

Pushing the freshly-created (empty) branch here needs no checks. The
`ci-verifier` → `ci-fixer-agent` → `code-reviewer` gates kick in later —
**only when a PR is opened** (`pr-to-dev` / `pr-dev-to-main`), where this
skill is step 1. Plain commits and branch pushes have no lint/format/review
gate at all; run `pre-commit-checks` by hand if you want lint + format tidy
mid-work.

## Types

| Type        | When to use                                  | Base branch |
| ----------- | -------------------------------------------- | ----------- |
| `feat/`     | New feature or functionality                 | `dev`       |
| `fix/`      | Bug fix                                      | `dev`       |
| `hotfix/`   | Urgent fix for production                    | `main`      |
| `chore/`    | Maintenance, dependencies, config, tooling   | `dev`       |
| `refactor/` | Restructuring code without changing behavior | `dev`       |
| `docs/`     | Documentation changes only                   | `dev`       |
| `test/`     | Adding or updating tests                     | `dev`       |
| `perf/`     | Performance improvements                     | `dev`       |
| `ci/`       | CI/CD pipeline or workflow changes           | `dev`       |

## Examples

- `feat/cage-availability-tracking`
- `fix/overbooking-hotel-service`
- `hotfix/payment-gateway-crash`
- `chore/update-prisma-dependencies`
- `refactor/extract-pricing-logic`
- `docs/update-api-readme`
