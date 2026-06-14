# INPUT:

<!-- Describe your change here. Include the type if you know it.
Examples:
feat: add cage availability tracking to booking module
fix: resolve overbooking issue on hotel service
chore: update prisma dependencies
refactor: extract pricing logic into utility function -->

---

# INSTRUCTIONS:

1. Determine the correct branch type from the change description.
2. Generate a branch name following the rules below.
3. Provide the git commands to pull the latest `dev` and create
   and publish the new branch.
   - For hotfixes only: pull from `main` instead of `dev`.

---

# RULES:

## Branch Naming

- Format: `<type>/<short-description>`
- Lowercase and hyphens only — no spaces, no underscores, no extra slashes
- Keep the description concise: 2–5 words max
- The name must be specific enough to identify the work at a glance

## Types

| Type        | When to use                                      |
| ----------- | ------------------------------------------------ |
| `feat/`     | New feature or functionality                     |
| `fix/`      | Bug fix                                          |
| `hotfix/`   | Urgent fix for production (branches from `main`) |
| `chore/`    | Maintenance, dependencies, config, tooling       |
| `refactor/` | Restructuring code without changing behavior     |
| `docs/`     | Documentation changes only                       |
| `test/`     | Adding or updating tests                         |
| `perf/`     | Performance improvements                         |
| `ci/`       | CI/CD pipeline or workflow changes               |

## Examples

- `feat/cage-availability-tracking`
- `fix/overbooking-hotel-service`
- `hotfix/payment-gateway-crash`
- `chore/update-prisma-dependencies`
- `refactor/extract-pricing-logic`
- `docs/update-api-readme`

---

# OUTPUT FORMAT:

```
## Branch Name
feat/cage-availability-tracking

## Git Commands
git checkout dev
git pull origin dev
git checkout -b feat/cage-availability-tracking
git push -u origin feat/cage-availability-tracking
```
