# Branch naming & creation

**Use whenever** starting new work: creating a branch, naming a branch, or
"start a branch for X" — before any commit or PR work begins.

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
