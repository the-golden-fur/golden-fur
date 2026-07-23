# Setup Guide

Step-by-step instructions to get Golden Fur running on your own machine. This
assumes no prior familiarity with Node.js tooling or Supabase — follow the
steps in order.

## 1. Install prerequisites

1. **Node.js 20+** — download from [nodejs.org](https://nodejs.org/) (choose
   the LTS installer for your OS) and run it. Verify it installed correctly:

   ```bash
   node --version   # should print v20.x.x or higher
   npm --version    # should print 10.x.x or higher
   ```

2. **Git** — download from [git-scm.com](https://git-scm.com/) if you don't
   already have it.

3. _(Optional, only if you want to run the database locally instead of using
   a hosted Supabase project)_ **Docker Desktop** from
   [docker.com](https://www.docker.com/products/docker-desktop/), and the
   Supabase CLI (already included as a dev dependency once you finish step 3
   below — you don't need to install it separately).

## 2. Clone and install

```bash
git clone https://github.com/the-golden-fur/golden-fur.git
cd golden-fur
npm run install:all
```

`install:all` installs dependencies for the root workspace, `client/`, and
`server/` in one command.

## 3. Create a Supabase project

1. Go to [supabase.com](https://supabase.com/) and sign up or log in.
2. Click **New Project**. Pick any organization, give it a name (e.g.
   `golden-fur`), set a database password (save it somewhere safe), and
   choose a region close to you. Click **Create new project** and wait a
   minute or two for it to provision.
3. Once the project is ready, open **Project Settings → API**. You'll need
   three values from this page in the next step:
   - **Project URL**
   - **anon / public** key
   - **service_role** key (click "Reveal" — keep this one secret, never
     commit it or share it)
4. Open **Project Settings → API → JWT Settings** and copy the **JWT
   Secret**.

## 4. Configure environment variables

Copy the example env files:

```bash
cp client/.env.example client/.env
cp server/.env.example server/.env
```

Open `client/.env` and fill in:

```
VITE_SUPABASE_URL=<your Project URL>
VITE_SUPABASE_ANON_KEY=<your anon/public key>
```

Open `server/.env` and fill in:

```
SUPABASE_URL=<your Project URL>
SUPABASE_ANON_KEY=<your anon/public key>
SUPABASE_SERVICE_ROLE_KEY=<your service_role key>
SUPABASE_JWT_SECRET=<your JWT secret>
```

Leave `SERVER_PORT`, `NODE_ENV`, and `CORS_ALLOWED_ORIGINS` as their default
values unless you have a specific reason to change them.

`client/.env.test` and `server/.env.test` follow the same pattern and are
used automatically when running the test suites — fill them in the same way
if you plan to run tests against a real Supabase project.

## 5. Apply database migrations

The database schema lives in `supabase/migrations/`. Link your local
checkout to the Supabase project you created, then push the migrations:

```bash
npx supabase login      # opens a browser to authenticate the CLI
npx supabase link       # select your project when prompted
npm run supabase:push   # applies every migration in supabase/migrations/
```

## 6. (Optional) Seed sample data

Sample staff accounts, customers, pets, services, and packages can be loaded
with:

```bash
npm run seed:all
```

Or one module at a time (`npm run seed:module-1`, `-2`, `-3` — see
`package.json` for what each covers). Seeded staff accounts use the password
`password123` with usernames like `makati.groomer1` or
`southwoods.receptionist1` — check the seed scripts in `supabase/seeds/` for
the full list.

## 7. Run the app

```bash
npm run dev
```

This starts both servers together:

- Client (React/Vite): [http://localhost:5173](http://localhost:5173)
- Server (Express API): [http://localhost:3000](http://localhost:3000)

Open [http://localhost:5173](http://localhost:5173) in your browser — you
should see the Golden Fur landing page. If you seeded data in step 6, you can
sign in at `/staff/login` with one of the seeded accounts.

To run just one side: `npm run client` or `npm run server`.

## 8. Run the tests

```bash
npm --prefix client run test
npm --prefix server run test
```

These are the same commands run automatically in CI on every pull request
(`.github/workflows/ci.yml`), alongside lint (`npm --prefix client run lint`,
`npm --prefix server run lint`) and a formatting check
(`npm run format:check`).

## Troubleshooting

- **`npm run dev` fails to reach Supabase / 401 errors** — double check
  `client/.env` and `server/.env` have no extra spaces or quotes around the
  values, and that you copied the **anon** key (not the service_role key)
  into `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY`.
- **CORS errors in the browser console** — make sure
  `CORS_ALLOWED_ORIGINS` in `server/.env` includes
  `http://localhost:5173` (the default already does).
- **`supabase link` can't find a project** — make sure you're logged into
  the same Supabase account/organization that owns the project from step 3.
- **Migrations fail to apply** — run `npm run supabase:status` to see which
  migrations are already applied, and `npm run supabase:repair` if the
  migration history is out of sync.
