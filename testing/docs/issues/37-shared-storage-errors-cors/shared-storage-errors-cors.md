# Issue #37: Storage Service + Error Classes + CORS Config

Type: Sprint 1 feature, tracked as Issue #37
Branch: `feat/shared-storage-errors-cors` (created fresh off `dev`, per the
issue's own branch spec - separate from #36/#38's work)

## Overview

Three cross-cutting concerns, all new shared infrastructure with no
consumers rewired to use it yet (existing call sites are explicitly out of
scope to touch):

- **Error classes** (`server/src/shared/errors/`): `AppError` base class
  plus `NotFoundError` (404), `ValidationError` (400, optional `details`),
  `UnauthorizedError` (401), `ForbiddenError` (403), `ConflictError` (409).
  `errorHandler.middleware.ts` is the centralized 4-arg Express error
  handler, registered last in `app.ts`.
- **Storage service** (`server/src/shared/services/storage/storage.service.ts`):
  bucket-agnostic `upload()`/`getPublicUrl()`/`remove()` wrapping Supabase
  Storage, generalizing the pattern `avatarUpload.service.ts` wrote inline
  in Epic B.
- **CORS config** (`server/src/shared/config/cors/cors.config.ts`): builds
  the `cors` package's options from `CORS_ALLOWED_ORIGINS` (comma-separated,
  whitespace-trimmed), registered in `app.ts` ahead of route mounting.

### A real regression I caught and fixed before it shipped

Adding `errorHandler.middleware.ts` as the last middleware in `app.ts`
initially **broke 4 pre-existing integration tests**
(`staff.integration.spec.ts` x2, `customerAuth.integration.spec.ts` x2).
Root cause: pre-Issue #37 code (`requireMfa.middleware.ts`,
`requireRole.middleware.ts`, `jwtMiddleware`, ...) throws a plain `Error`
with a manually attached `.statusCode` property and calls `next(error)`.
Before this issue, nothing but Express's own default error handler ever
saw that - and Express's default *does* read `.statusCode`. My first
`errorHandler` draft only checked `instanceof AppError`, so it silently
turned all of those intentional 401s/403s into generic 500s the moment it
became the app's only error handler.

Fixed by adding a fallback in `errorHandler.middleware.ts`: after the
`AppError` check, it also honors a plain `Error` with a numeric
`.statusCode` in the 400-599 range (the exact legacy pattern), and only
falls through to the generic 500 for errors with no recognizable status at
all. This matches the issue's own Out-of-Scope note (those call sites
aren't rewritten here) - the new handler had to stay behaviorally
compatible with them, not just with the new `AppError` hierarchy. Covered
by a dedicated test in `errorHandler.middleware.spec.ts`
("honors a legacy-style Error with a manually attached statusCode").

## Automated Verification

From `server/`:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
```

Actually run as part of this work (not just prescribed): typecheck clean,
lint clean (0 errors - 3 pre-existing warnings in unrelated files), **262/262
tests pass** across 32 test files, including the 4 previously-regressed
integration tests confirmed passing again after the fix above.

## Manual Verification

### Part 1 - Error classes respond correctly (AC-1, AC-2)

These are exercised through the unit tests in
`errorHandler.middleware.spec.ts` (10 cases: each of the 5 `AppError`
subclasses, `ValidationError` with and without `details`, a custom
`AppError` subclass status code, the legacy-statusCode fallback, and two
"truly unrecognized error" cases confirming a generic 500 with no leaked
message). There's no live HTTP route yet that throws these classes (Out of
Scope: existing controllers aren't rewritten to use them in this issue), so
there's nothing meaningful to click through in a browser or Postman for
this part - the unit tests *are* the verification surface.

1. Open `server/src/shared/errors/errorHandler.middleware.spec.ts` and skim
   the test names/assertions to see AC-1 and AC-2 covered directly.

### Part 2 - Storage service (AC-3)

Also unit-test-only for the same reason (no consumer yet).

2. Open `server/src/shared/services/storage/storage.service.spec.ts` -
   confirms `upload()` returns a public URL string on success, throws
   `ConflictError` on an "already exists" Storage error and a generic
   `AppError` on other failures, and `remove()` calls
   `supabase.storage.from(bucket).remove([path])`.

### Part 3 - CORS, verified live against a running server (AC-4, AC-5, AC-6)

This part *is* observable over real HTTP, and was actually run against a
live `npm run dev` server (not just asserted) as part of this work:

3. Start the server: in `server/`, run `npm.cmd run dev`. Confirm it prints
   `Server started on port 3000.` with no errors (AC-6, `development`).
4. Import
   `testing/docs/issues/37-shared-storage-errors-cors/shared-storage-errors-cors.postman_collection.json`
   into Postman (same Import flow as Issue #36's collection, if you need a
   refresher: **Import** → **File** → pick the file).
5. Run the collection. Confirm:
   - **Allowed origin** request shows an `Access-Control-Allow-Origin`
     header matching `http://localhost:5173` in the response - this is the
     header a browser actually checks; its presence is what "CORS allows
     it" means in practice (AC-4 accept case).
   - **Disallowed origin** request shows **no**
     `Access-Control-Allow-Origin` header at all - a browser would block
     the response client-side regardless of the HTTP status code returned
     (AC-4 reject case). The body is a clean `{"error":"Internal server
     error"}` with no stack trace, because the CORS library's rejection
     flows through the new `errorHandler` too.
6. For AC-6's `test` `NODE_ENV` case: this is implicitly proven by the
   entire automated test suite above (all 32 test files import `app` from
   `app.ts` under `NODE_ENV=test` via Vitest, and none failed to load it).
   If you want to see it directly, run
   `NODE_ENV=test npx tsx src/app.ts` from `server/` (PowerShell:
   `$env:NODE_ENV='test'; npx tsx src/app.ts`) and confirm the process
   starts and exits cleanly without listening on a port (by design - see
   `app.ts`'s `if (process.env.NODE_ENV !== 'test')` guard).
