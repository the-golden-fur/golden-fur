# Deployment Guide

How Golden Fur runs in production, and every setting you need to keep the
three hosted pieces working together. `docs/setup.md` covers local
development; this document covers the deployed system.

## Topology

| Piece                                          | Host                                     | URL                                      | Deploys from                   |
| ---------------------------------------------- | ---------------------------------------- | ---------------------------------------- | ------------------------------ |
| Customer Portal + Staff Console (one Vite SPA) | Vercel — project `golden-fur-client`     | `https://golden-fur-client.vercel.app`   | `main` (Git integration)       |
| API server (Express)                           | Render — web service `golden-fur-server` | `https://golden-fur-server.onrender.com` | `main` (auto-deploy on commit) |
| Database, Auth, Storage                        | Supabase (hosted project)                | —                                        | migrations pushed manually     |

Both hosts build from `main`. A push/merge to `main` triggers a Vercel
build and a Render deploy at the same time. The Supabase schema is **not**
tied to Git — you push migrations yourself (see below), and it must be done
**before** the server that expects the new schema goes live.

The `main` branch is the release branch. Day-to-day work merges into `dev`;
promoting `dev` into `main` is what ships to production.

## The client (Vercel)

Settings live in the Vercel dashboard; `client/vercel.json` pins the parts
that must not drift:

- **Root Directory**: `client`
- **Framework Preset**: Vite
- **Build Command**: `npm run build` &nbsp;(`tsc -b && vite build`)
- **Output Directory**: `dist`
- **Rewrites**: everything → `/index.html` so client-side routes and hard
  refreshes work. Static files in `dist/` still win (Vercel checks the
  filesystem before applying a rewrite), so `/assets/*` is unaffected.
  Without this, every route except `/` returns a 404.

### Environment variables (Vercel → Settings → Environment Variables)

Set these for **Production** and **Preview**. All are read at build time and
baked into the bundle (`import.meta.env.VITE_*`), so changing one needs a
redeploy.

| Variable                 | Value                                        | Notes                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | the production Supabase project URL          | required — auth degrades to unusable without it                                                                                                                                           |
| `VITE_SUPABASE_ANON_KEY` | the production Supabase anon/publishable key | required                                                                                                                                                                                  |
| `VITE_API_BASE_URL`      | `https://golden-fur-server.onrender.com`     | **required in production.** Prepended to every API call. If unset it defaults to `''` (same origin) and all `/auth/*`, `/staff/*`, `/customers/*` requests hit the Vercel domain and 404. |

## The server (Render)

Free instance — it spins down after ~15 minutes idle and the next request
eats a 30–60s cold start. `render.yaml` at the repo root documents the
service (it is not auto-applied to the existing one — reconcile by hand).

- **Root Directory**: `server`
- **Build Command**: `npm install`
- **Start Command**: `npm start` &nbsp;(`tsx src/app.ts` — no build step; `tsx` runs the TypeScript directly and is a runtime dependency)
- **Health Check Path**: `/health`
- **Auto-Deploy**: On Commit
- **Port**: Render injects `PORT`; `app.ts` binds `SERVER_PORT || PORT || 3000`, so no port variable needs setting on Render.
- **Node**: `server/package.json` declares `engines.node >= 20`.

### Environment variables (Render → golden-fur-server → Environment)

| Variable                        | Required? | Value / notes                                                                                                                                                                                                  |
| ------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                      | yes       | `production`                                                                                                                                                                                                   |
| `SUPABASE_URL`                  | yes       | production Supabase URL                                                                                                                                                                                        |
| `SUPABASE_ANON_KEY`             | yes       | production anon key — used by the staff/customer auth controllers                                                                                                                                              |
| `SUPABASE_SERVICE_ROLE_KEY`     | yes       | production service-role key — bypasses RLS, never exposed to the client                                                                                                                                        |
| `SUPABASE_JWT_SECRET`           | set it    | currently not read by server code, but keep it in sync                                                                                                                                                         |
| `CORS_ALLOWED_ORIGINS`          | yes       | `https://golden-fur-client.vercel.app` (plus any custom domains). Comma-separated, **no spaces, no trailing slash.** An unlisted browser origin is rejected.                                                   |
| `STAFF_TEMP_CREDENTIAL_KEY`     | yes       | base64 string that decodes to **exactly 32 bytes** (`openssl rand -base64 32`). Staff account creation/resend throws without it.                                                                               |
| `RESEND_API_KEY`                | see notes | transactional email. **Resend is being replaced by Brevo** — until then, leave unset on any environment where email isn't provisioned; email-triggering flows will error, which is expected, not a regression. |
| `RESEND_FROM_EMAIL`             | optional  | verified sender/domain; sandbox default works for testing only                                                                                                                                                 |
| `PAYMONGO_SECRET_KEY`           | dormant   | the client has not approved a PayMongo account. Leave unset; online-payment paths stay inactive (checkout 500s) until it exists. A future admin setting will toggle online payments explicitly.                |
| `PAYMONGO_WEBHOOK_SECRET`       | dormant   | as above                                                                                                                                                                                                       |
| `PAYMONGO_SERVICE_FEE_PERCENT`  | optional  | defaults to `2.5`                                                                                                                                                                                              |
| `PAYMONGO_REDIRECT_SUCCESS_URL` | dormant   | `https://golden-fur-client.vercel.app/portal/payment/success` when live                                                                                                                                        |
| `PAYMONGO_REDIRECT_FAILED_URL`  | dormant   | `https://golden-fur-client.vercel.app/portal/payment/failed` when live                                                                                                                                         |
| `DAYCARE_SESSION_CAPACITY`      | optional  | bare number or JSON branch map; defaults to `15`                                                                                                                                                               |

Facebook/Google OAuth is configured in the **Supabase** dashboard (Auth →
Providers), not through server env vars. Facebook login stays dormant until
the client provisions an app.

## The database (Supabase)

- Apply migrations with the Supabase CLI against the **linked production
  project**:

  ```bash
  npm run supabase:login
  npm run supabase:link          # select the production project ref
  npm run supabase:status        # list local vs remote migration state
  npm run supabase:push          # apply pending migrations
  ```

- Review the pending list before pushing. Migrations are forward-only in
  production.
- Check the project isn't paused (free tier pauses after ~1 week idle).
- Auth → URL Configuration must list `https://golden-fur-client.vercel.app`
  as a redirect URL, or OAuth and email links bounce.

## Shipping `dev` → `main`

1. **Push Supabase migrations first** (section above). If the new server
   boots against the old schema it 500s across the board.
2. Confirm the Render env vars in the table above are all present —
   especially `SUPABASE_ANON_KEY`, `CORS_ALLOWED_ORIGINS` (pointing at the
   Vercel domain), and `STAFF_TEMP_CREDENTIAL_KEY`.
3. Merge the release PR (`dev` → `main`). Prefer a rebase merge; never
   squash — it must preserve the individual feature commits.
4. Merging triggers the Vercel build and the Render deploy automatically.
   Watch both dashboards' logs.
5. Set `VITE_API_BASE_URL` on Vercel (if not already) and **redeploy** —
   env changes alone don't rebuild.
6. Run the verification checklist below.

## Verifying a deploy

```bash
# server is up
curl -s https://golden-fur-server.onrender.com/health          # {"status":"ok"}

# SPA routing works (not a 404)
curl -sI https://golden-fur-client.vercel.app/staff/login | head -1   # HTTP/2 200

# the landing-page stylesheet is actually in the bundle
curl -s https://golden-fur-client.vercel.app/ \
  | grep -oE '/assets/index-[^"]+\.css'                          # note the hash
curl -s "https://golden-fur-client.vercel.app/assets/index-<hash>.css" \
  | grep -o '.hero{'                                             # should match
```

In a browser:

- Landing page (`/`) is fully styled — navbar, hero, service cards.
- Hard-refresh on `/staff` and `/portal` — no 404.
- Staff login succeeds; the Network tab shows requests going to
  `golden-fur-server.onrender.com`, not the Vercel domain; no CORS errors.
- Spot-check one booking flow end to end (exercises the Supabase schema).

## Known gotchas

- **Unstyled landing page** — was caused by `LandingPage.module.css` being
  a side-effect-only CSS-module import, which the production bundler
  tree-shakes out. Fixed by making it a plain `LandingPage.css`. If landing
  styles ever vanish again, check the built CSS actually contains `.hero{`.
- **First request after idle hangs** — the free Render instance cold start.
  Not a bug. Consider a keep-alive ping to `/health` or a paid instance.
- **`VITE_*` change didn't take effect** — you must redeploy Vercel; those
  values are compiled in at build time.
