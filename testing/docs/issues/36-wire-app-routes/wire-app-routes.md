# Issue #36: Wire All App Routes (Client + Server)

Type: Sprint 1 chore, tracked as Issue #36
Branch: `chore/wire-app-routes`

## Overview

This issue ensures that every route built across Sprint 1's epics is registered in a single place, making the whole app navigable end-to-end. No new user-facing behavior is introduced here - the underlying pages/endpoints already shipped in Epics A, A-1, B, and C. This is purely a reachability/wiring check.

## Current Implementation Status

Both server and client routing have been fully wired:

### Server-side: `server/src/shared/app.routes.ts`

- ✅ Imports and mounts `authRoutes` (auth, staff/customer)
- ✅ Imports and mounts `staffRoutes` (/staff endpoints)
- ✅ Imports and mounts `customerRoutes` (/customers and /pets endpoints)

### Client-side: `client/src/routes.tsx`

- ✅ Registers all feature route modules:
  - `staffAuthRoutes` (/staff/login, /staff/mfa/\*, /staff/profile, etc.)
  - `staffRoutes` (/staff/admin/\*, additional staff pages)
  - `customerAuthRoutes` (/login, /signup, /auth/callback, /portal/\*, etc.)
  - `customerRoutes` (/portal/profile, /portal/pets/:petId)
  - `LandingPage` (/)

## Route Structure

### Server Routes by Feature

| Feature   | Base Paths                           | Mount Location |
| --------- | ------------------------------------ | -------------- |
| Auth      | `/auth/staff/*`, `/auth/customers/*` | authRoutes     |
| Staff     | `/staff`, `/staff/unavailability/*`  | staffRoutes    |
| Customers | `/customers`, `/customers/:id`       | customerRoutes |
| Pets      | `/pets/*` (nested under customers)   | customerRoutes |

### Client Routes by Feature

| Feature        | Paths                                                       | Component          |
| -------------- | ----------------------------------------------------------- | ------------------ |
| Staff Auth     | `/staff/login`, `/staff/mfa/enroll`, `/staff/mfa/verify`    | staffAuthRoutes    |
| Staff Pages    | `/staff`, `/staff/profile`, `/staff/admin/*`                | staffRoutes        |
| Customer Auth  | `/login`, `/signup`, `/auth/callback`, `/portal/mfa/verify` | customerAuthRoutes |
| Customer Pages | `/portal/profile`, `/portal/pets/:petId`                    | customerRoutes     |
| Landing        | `/`                                                         | LandingPage        |

## Route Order Analysis

The current registration order in `client/src/routes.tsx` prevents path-prefix collisions:

1. Staff routes are isolated under `/staff/*` prefix
2. Customer routes are isolated under `/login`, `/signup`, `/portal/*` prefixes
3. Landing page `/` is registered last (catch-all friendly position)

No unintended shadowing between static and dynamic segments detected.

## Acceptance Criteria Verification

### AC-1: Server routes reachable via top-level Express app

**Status**: ✅ Complete

- All three route modules (auth, staff, customer) mounted via `router.use()`
- Each feature's routes are imported and registered

### AC-2: Client routes reachable via `client/src/routes.tsx`

**Status**: ✅ Complete

- All feature route imports are registered
- All authentication flows are protected via route guards (StaffAuthGuard, CustomerAuthGuard)
- Landing page is available at root path

### AC-3: No regression of existing routes

**Status**: Requires test verification (see testing tasks below)

### AC-4: `server/src/shared/app.routes.ts` mounts customerRoutes

**Status**: ✅ Complete

- `customerRoutes` is imported from `../features/customers/customer.routes.ts`
- Mounted via `router.use(customerRoutes)` alongside authRoutes and staffRoutes

### AC-5: No unintended path shadowing

**Status**: ✅ Complete

- Staff routes use `/staff/*` prefix
- Customer routes use `/login`, `/signup`, `/portal/*` prefixes
- Landing page uses `/` (appropriate final position)
- No dynamic segment conflicts detected

## Automated Verification

From `server/`:

```powershell
npm.cmd run test
npx tsc --noEmit
```

From `client/`:

```powershell
npm.cmd run test
npx tsc -b
```

Expected: all existing suites pass unmodified (AC-3) - this issue does not add
or change any test files, since it only wires already-tested route modules
into the top-level routers.

## Manual Verification

### Part 1 - Server routes are mounted and not shadowed (AC-1, AC-4, AC-5)

This is a route-_existence_ check, not a business-logic re-test: every
request below is expected to come back with a real handler response
(`200`/`400`/`401`/`403`) and never a `404`, since a `404` here would mean a
route isn't mounted, or an earlier route is shadowing it.

1. Start the server: in `server/`, run `npm.cmd run dev`. Leave it running.
2. Open Postman (or the VS Code "Postman" / "Thunder Client" style extension
   if you don't have the desktop app - any HTTP client works).
3. Click **Import** in Postman, choose **File**, and select
   `testing/docs/issues/36-wire-app-routes/wire-app-routes.postman_collection.json`
   from this repo. It will appear as a new collection named "Issue #36 - Wire
   All App Routes (Server Route-Existence Smoke Test)" in your sidebar.
4. The collection's `base_url` variable already defaults to
   `http://localhost:3000` (the server's default `SERVER_PORT`). If your
   local `server/.env` uses a different `SERVER_PORT`, click the collection
   name → **Variables** tab and update `base_url` before running.
5. Click the collection's **⋯** menu → **Run collection** → **Run Issue #36
   ...** (or open and send each request individually with the **Send**
   button).
6. Confirm every request shows a green passing test in the **Test Results**
   tab of its response. In particular:
   - `GET /staff/unavailability/pending` and `GET /staff/some-id` both come
     back `401` (not `404`) - this is the concrete proof that the static
     `/staff/unavailability/pending` route isn't shadowed by the dynamic
     `/staff/:id` route registered after it (AC-5).
   - `GET /customers/some-id` and `GET /customers/some-id/pets` both come
     back `401` - proof the 3-segment pet route isn't swallowed by the
     2-segment customer route (AC-5).
   - The final "Unmounted path sanity check" request _does_ return `404` -
     this is a control case confirming the smoke test can actually tell the
     difference between "mounted" and "not mounted."

### Part 2 - Client routes are registered (AC-2)

1. Start the client: in `client/`, run `npm.cmd run dev`, then open the
   printed local URL (typically `http://localhost:5173`) in your browser.
2. Navigate directly to each path below by typing it into the browser's
   address bar (not by clicking links), and confirm the page loads instead
   of falling through to a blank screen or an unrelated route:
   - `/` - Landing page
   - `/staff/login` - Staff login form
   - `/staff/mfa/enroll` - MFA enrollment page
   - `/staff/mfa/verify` - MFA verification page
   - `/login` - Customer login form
   - `/signup` - Customer signup form
   - `/auth/callback` - OAuth callback page (may show a loading/error state
     with no `code` param present - that's fine, you're only confirming the
     route renders its component instead of a blank/404 page)
   - `/portal/mfa/verify` - Customer MFA verification page
3. Confirm the auth-guarded pages redirect rather than error when signed
   out, by navigating directly to each of these while logged out and
   confirming you land on the matching login page instead of a crash:
   - `/staff/profile`, `/staff/admin/staff`, `/staff/admin/unavailability`,
     `/staff/admin/customers` → should redirect to `/staff/login`
   - `/portal/profile`, `/portal/pets/some-id` → should redirect to `/login`
4. Log in as a staff account (e.g. `makati.superadmin@goldenfur.com` /
   `password123`, from Issue #38's seed script - see
   `testing/docs/issues/38-sprint1-seed-data/sprint1-seed-data.md` if that
   hasn't been run yet), then navigate to `/staff/profile`,
   `/staff/admin/staff`, `/staff/admin/unavailability`, and
   `/staff/admin/customers` again - confirm each now renders its real page
   instead of redirecting.
5. Log in as a customer account (e.g. `customer9@goldenfur.com` /
   `password123`, which has 2 seeded pets), then navigate to
   `/portal/profile` and `/portal/pets/<one of that customer's pet ids>` -
   confirm each renders.

### Part 3 - No regressions (AC-3)

1. This is covered by the **Automated Verification** step above passing
   unmodified - no route-level test files were touched by this issue.
