#!/usr/bin/env node
/**
 * Free one or more TCP ports before a dev server tries to bind them.
 *
 * The recurring pain this removes: a previous `tsx watch` / `vite` process
 * didn't shut down (VS Code task killed the terminal but not the child,
 * a crash, a second "start all"), so the next `npm run dev` dies with
 * `EADDRINUSE :::3000` or Vite silently limps onto 5174 and then trips
 * CORS. Wired as `predev` in client/ and server/ so it runs automatically;
 * also runnable directly: `node scripts/free-ports.mjs 3000 5173`.
 *
 * Only kills the process that is LISTENING on the given port. TIME_WAIT
 * sockets and unrelated processes are left alone.
 */
import { execSync } from 'node:child_process';

const ports = process.argv
  .slice(2)
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
      const out = execSync(`netstat -ano -p TCP`, { encoding: 'utf8' });
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
for (const port of ports) {
  for (const pid of listenerPids(port)) {
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
