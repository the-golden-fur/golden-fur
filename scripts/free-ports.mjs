#!/usr/bin/env node
/**
 * Free one or more TCP ports before a dev server tries to bind them.
 *
 * The recurring pain this removes: a previous `tsx watch` / `vite` process
 * didn't shut down (VS Code task killed the terminal but not the child,
 * a crash) so the next `npm run dev` dies with `EADDRINUSE :::3000` or Vite
 * silently limps onto 5174 and then trips CORS. Wired as `predev` in
 * client/ and server/ so it runs automatically; also runnable directly:
 * `node scripts/free-ports.mjs 3000 5173`.
 *
 * Only kills the process that is LISTENING on the given port. TIME_WAIT
 * sockets and unrelated processes are left alone.
 *
 * Safety check before killing anything: a port that's LISTENING and still
 * answering HTTP requests is treated as a real, wanted dev server (not a
 * leftover) - re-running "npm run dev" / the "Start All" task while one is
 * already up must never silently force-kill your working session. In that
 * case this script prints why and exits non-zero, which stops the `predev`
 * -> `dev` npm chain before Vite/tsx even tries to bind the busy port. Pass
 * `--force` to skip this check and kill it anyway.
 */
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const force = args.includes('--force');
const ports = args
  .filter((arg) => arg !== '--force')
  .map((arg) => Number(arg))
  .filter((port) => Number.isInteger(port) && port > 0 && port < 65536);

if (ports.length === 0) {
  console.error('free-ports: pass at least one port number');
  process.exit(1);
}

const isWindows = process.platform === 'win32';

/** PIDs LISTENING on `port` (never TIME_WAIT / client sockets). */
function listenerPids(port) {
  try {
    if (isWindows) {
      // No -p filter: `-p TCP` silently excludes IPv6 listeners (Windows
      // splits TCP/TCPv6 as separate netstat protocol filters), so a Vite
      // dev server bound to [::1]:5173 - which happens whenever `localhost`
      // resolves to ::1 first, the common case on this OS - was never
      // found, never freed, and kept colliding with the next npm run dev.
      // UDP rows never show LISTENING, so the filter below already excludes
      // them without needing -p TCP to do it.
      const out = execSync(`netstat -ano`, { encoding: 'utf8' });
      return [
        ...new Set(
          out
            .split(/\r?\n/)
            .filter(
              (line) =>
                /\bLISTENING\b/.test(line) &&
                new RegExp(`[:.]${port}\\s`).test(line)
            )
            .map((line) => line.trim().split(/\s+/).pop())
            .filter((pid) => pid && pid !== '0')
        ),
      ];
    }
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: 'utf8',
    });
    return [...new Set(out.split(/\s+/).filter(Boolean))];
  } catch {
    return []; // nothing listening (or the tool isn't available)
  }
}

/** Whether something is actually answering HTTP requests on `port` right
 * now - the signal that a LISTENING socket is a live, wanted dev server
 * rather than a stale/zombie one. Any response at all counts (a 404 from
 * Express is just as much "alive" as Vite's index.html) - only a refused
 * connection or a timeout means treat it as stale. */
async function isAlive(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(400),
    });
    return true;
  } catch {
    return false;
  }
}

function kill(pid) {
  try {
    execSync(isWindows ? `taskkill /PID ${pid} /T /F` : `kill -9 ${pid}`, {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

let freed = 0;
let blocked = false;

for (const port of ports) {
  const pids = listenerPids(port);
  if (pids.length === 0) continue;

  if (!force && (await isAlive(port))) {
    console.error(
      `free-ports: :${port} is already running and responding (PID ${pids.join(', ')}) - ` +
        `leaving it alone, not starting a second one. Close the existing dev ` +
        `server first if you want to restart it, or re-run with --force to ` +
        `kill it anyway.`
    );
    blocked = true;
    continue;
  }

  for (const pid of pids) {
    if (kill(pid)) {
      freed += 1;
      console.log(`free-ports: freed :${port} (killed PID ${pid})`);
    }
  }
}

// Give the OS a moment to actually release a just-killed listener before
// the dev server tries to bind it. No-op on the happy path.
if (freed > 0) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800);
}

// A port left alive-and-skipped means the upcoming `vite`/`tsx watch` bind
// would just fail with EADDRINUSE anyway - fail predev now, with a reason,
// instead of letting that happen with a confusing stock error.
if (blocked) {
  process.exit(1);
}
