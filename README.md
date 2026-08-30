# Golden Fur

Golden Fur is a management information system (MIS) for a two-branch pet care
business (**Makati** and **Southwoods**) offering grooming, pet hotel,
daycare, and veterinary services. It gives customers a self-service booking
portal and gives staff role-scoped tools for running day-to-day branch
operations — bookings, service execution, billing, promos/discounts, and
customer & pet records.

## Description

The system is split into two applications sharing one Supabase backend:

- **Customer Portal** — register/sign in (email or Google/Facebook OAuth),
  manage pet profiles, book and manage appointments across services and
  packages, view service history, and track promo/credit balances.
- **Staff Console** — role-based dashboards (Superadmin, Admin, Supervisor,
  Receptionist, Groomer, Veterinarian, Cashier, Pet Assistant) covering staff
  account management, the booking queue, customer/pet management, service &
  package configuration, and promo/discount administration.

See [docs/architecture.md](docs/architecture.md) for the full module
breakdown and how the codebase is organized.

## Tech Stack

| Layer         | Technology                                                  |
| ------------- | ----------------------------------------------------------- |
| Frontend      | React 19, TypeScript, Vite, React Router, Zod               |
| Backend       | Node.js, Express, TypeScript, Zod                           |
| Database/Auth | Supabase (PostgreSQL 17, Auth, Storage, Row-Level Security) |
| Testing       | Vitest, Testing Library, Supertest                          |
| Tooling       | ESLint, Prettier, GitHub Actions CI                         |

## System Requirements

- [Node.js](https://nodejs.org/) 20 or later
- npm 10 or later (bundled with Node.js)
- [Git](https://git-scm.com/)
- A [Supabase](https://supabase.com/) account and project (free tier is
  enough)
- Optional, for running Supabase locally instead of against a hosted
  project: [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)

Full, step-by-step setup instructions (including how to create your Supabase
project and fill in every environment variable) are in
[docs/setup.md](docs/setup.md).

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/the-golden-fur/golden-fur.git
cd golden-fur

# 2. Install dependencies for the root, client, and server workspaces
npm run install:all

# 3. Create your environment files from the provided examples
cp client/.env.example client/.env
cp server/.env.example server/.env
# then fill in your Supabase URL/keys in both files — see docs/setup.md
```

## How to Run the Program

```bash
# Start both the client (http://localhost:5173) and server (http://localhost:3000)
npm run dev

# Or start them individually
npm run client
npm run server
```

Run the test suites:

```bash
npm --prefix client run test
npm --prefix server run test
```

Lint and format checks (same checks run in CI):

```bash
npm --prefix client run lint
npm --prefix server run lint
npm run format:check
```

See [docs/setup.md](docs/setup.md) for Supabase migrations, seeding sample
data, and troubleshooting.

## Documentation

- [docs/setup.md](docs/setup.md) — guided environment & Supabase setup
- [docs/architecture.md](docs/architecture.md) — module list, folder
  structure, and system design
- [docs/deployment.md](docs/deployment.md) — production hosts, environment
  variables, and the release runbook
- [docs/privacy-policy.html](docs/privacy-policy.html) — privacy policy

## Team Members

- [cH0NKIIs34L](https://github.com/cH0NKIIs34L)
- [akazuuuu](https://github.com/akazuuuu)
- [rie755](https://github.com/rie755)

## License

Distributed under the [MIT License](LICENSE).
