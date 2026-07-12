# Issue #36: Wire All App Routes (Client + Server)

## Overview

This issue ensures that every route built across Sprint 1's epics is registered in a single place, making the whole app navigable end-to-end.

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

## Testing Checklists

### Server-side Route Verification

Verify that each server route exists and responds:

- [ ] GET `/auth/staff/*` - Staff auth endpoints
- [ ] GET `/auth/customers/*` - Customer auth endpoints
- [ ] GET `/staff` - List staff (requires auth)
- [ ] GET `/staff/:id` - Get staff profile (requires auth)
- [ ] GET `/staff/unavailability/pending` - List pending blocks (requires auth)
- [ ] GET `/customers` - List customers (requires auth)
- [ ] GET `/customers/:id` - Get customer profile (requires auth)
- [ ] GET `/pets/*` - Pet-related endpoints (requires auth)

### Client-side Route Navigation Verification

Navigate to each route path in the browser and verify it renders correctly:

- [ ] `/` - Landing page loads
- [ ] `/staff/login` - Staff login form displays
- [ ] `/staff/mfa/enroll` - MFA enrollment page displays
- [ ] `/staff/mfa/verify` - MFA verification page displays
- [ ] `/staff` - Staff dashboard displays (with auth guard)
- [ ] `/staff/profile` - Staff profile page displays (with auth guard)
- [ ] `/staff/admin/staff` - Admin staff list displays (with auth guard)
- [ ] `/staff/admin/unavailability` - Unavailability approval queue displays (with auth guard)
- [ ] `/staff/admin/customers` - Admin customer list displays (with auth guard)
- [ ] `/login` - Customer login form displays
- [ ] `/signup` - Customer signup form displays
- [ ] `/auth/callback` - OAuth callback page displays
- [ ] `/portal/mfa/verify` - Customer MFA verification page displays
- [ ] `/portal/profile` - Customer profile page displays (with auth guard)
- [ ] `/portal/pets/:petId` - Pet detail page displays (with auth guard)

### Regression Test Verification

- [ ] Run `npm run test:run` in server/ directory - all tests pass
- [ ] Run `npm run test:run` in client/ directory - all tests pass
- [ ] Run linter checks pass for both client and server
