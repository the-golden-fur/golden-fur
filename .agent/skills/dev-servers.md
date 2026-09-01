# Running this project's dev servers

**Use whenever** asked to run, start, restart, or troubleshoot the app
locally — this project has two independent dev servers, and most "it's
broken" reports are actually just one of them not running, or an agent
having started a second, colliding copy of one that was already up.

## The setup

- **`server/`** — Express + `tsx watch src/app.ts`, binds port **3000**.
- **`client/`** — Vite, binds port **5173** (falls to 5174+ if taken),
  proxies API calls to `http://localhost:3000`. The proxy prefixes are
  generated from `client/vite.proxy.config.ts` (`API_ROUTE_PREFIXES`), one
  per server route file — `vite.proxy.config.spec.ts` fails CI if a server
  route has no matching prefix, so a new route can't silently 404-via-HTML
  in dev. Every `ECONNREFUSED`/`http proxy error` in the Vite log means the
  server isn't reachable on 3000 at that moment — not a client bug.
- Both `npm run dev` scripts have a **`predev`** that runs
  `node scripts/free-ports.mjs` first, killing any stale listener on the
  port it's about to bind (the fix for recurring `EADDRINUSE :::3000` and
  the silent Vite-on-5174 → CORS mess). CORS also allows any `localhost:*`
  origin outside production, so a 5174 fallback still works.
- Root `npm run dev` (via `concurrently`) or the VS Code task **"🚀 Dev:
  Start All"** starts both together. The VS Code tasks **"💻 Client: Dev"**
  and **"🖥️ Server: Dev"** each start only one half — if a user's terminal
  banner says `Executing task in folder client: npm run dev`, the server is
  very likely not running at all, not crashed.

## Before starting anything, check what's already running

**Never start a dev server (client or server) without first checking
whether one is already listening on its port.** Starting a second instance
is the single most common way this goes wrong — either it crashes
immediately with `EADDRINUSE` (server) or it's silently redundant and
confusing (client). Check with:

```powershell
Get-NetTCPConnection -LocalPort 3000,5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess
```

- If a port is already listening, **that's the answer** — report it,
  don't launch a competing copy "just to check." A person running dev
  servers in their own terminal is extremely common; an agent's job is to
  read that state, not race it.
- Only start a server yourself (via a background task) if the relevant
  port is confirmed empty, or the user explicitly asks you to (re)start it.
- If you do start one, use the root `npm run dev` (or the matching single
  script) — never `taskkill /IM node.exe /F` to "clean up," since that
  kills every Node process on the machine, including unrelated tools.

## `EADDRINUSE`, or a stale server won't die

`npm run <dev>`'s `predev` handles this automatically now. To do it by
hand: **`npm run free-ports`** (root) frees both 3000 and 5173;
`node scripts/free-ports.mjs 3000` frees just one. It kills only the
process **LISTENING** on that exact port — `TIME_WAIT` sockets (the
`[::1]:3000 ... TIME_WAIT` lines) are not processes and clear on their
own; leave them. Then re-run the dev script.

## A proxy error right at startup is not necessarily a bug

If client and server are started together (or close together), Vite may
log one or two `ECONNREFUSED` proxy errors in the first couple of seconds
while the Express server is still booting (TypeScript transform, Supabase
client init, etc.). This is normal and self-resolves — it does not require
a restart. Before treating it as a real failure:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
```

If port 3000 is now listening, the app is fine — the error was just a
timing race during boot. Only escalate (check server startup logs for a
real crash, e.g. `EADDRINUSE`, an uncaught exception, a missing env var)
if the port is still empty a few seconds later.

## If asked to stop/kill the dev servers

Find the owning PIDs the same way (`Get-NetTCPConnection`), then
`Stop-Process -Id <pid> -Force`. `tsx watch`'s process tree can leave
orphaned `npm`/`cross-env`/`tsx` children behind if only the top-level
task is stopped — after killing, re-check the port list to confirm nothing
is still bound before telling the user it's clear.
