#!/usr/bin/env node
/* One command instead of two terminals and a remembered set of flags.
 *
 *   npm start            sidecar + coach, on demand, settings from rbc.config.json
 *
 * Spawns both as children and dies with them: the failure mode this replaces
 * is a sidecar still holding port 8787 after you closed the window it was
 * printing to, which then looks like "address already in use" an hour later.
 * Anything after `--` is passed through to the coach.
 */
"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const passthrough = process.argv.slice(2);
const children = [];

function run(name, args, colour) {
  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);

  // Prefixed rather than interleaved raw: two processes writing to one
  // terminal is unreadable without knowing which said what.
  const tag = `\x1b[${colour}m[${name}]\x1b[0m `;
  const pipe = (stream, to) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) to.write(tag + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on("exit", (code, signal) => {
    process.stdout.write(`${tag}exited (${signal || code})\n`);
    stop(code === 0 ? 0 : 1);
  });
  return child;
}

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    try { c.kill("SIGTERM"); } catch (_) {}
  }
  setTimeout(() => process.exit(code ?? 0), 200);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

/* Is a sidecar already up, and is it ours?
 *
 * Starting one unconditionally meant that a sidecar left over from a previous
 * session — which is easy to do, since it is a server and outlives the
 * terminal that printed to it — killed this command with a raw EADDRINUSE
 * stack trace. That names the symptom and not one useful thing to do about
 * it.
 *
 * A running sidecar is not a problem, it is a sidecar. So: probe it, and if
 * it answers like ours, use it. `stateFile` is the tell — nothing else on
 * this machine answers /health with that.
 *
 * Something else on 8787 IS a problem, and gets said plainly rather than
 * being reported as a port number. */
const PORT = Number(process.env.RBC_PORT || 8787);
const SIDECAR = `http://127.0.0.1:${PORT}`;

async function existingSidecar() {
  let body;
  try {
    const res = await fetch(`${SIDECAR}/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { other: `answered ${res.status}` };
    body = await res.json();
  } catch (_) {
    return null;   // nothing there — ours to start
  }
  if (body && typeof body.stateFile === "string") return { ours: body };
  return { other: "answered, but not like the Riftbound sidecar" };
}

function startCoach() {
  run("coach", [path.join(ROOT, "coach", "index.js"), "--serve", ...passthrough], "35");
  console.log(`\n  Open \x1b[4m${SIDECAR}\x1b[0m — or press Ctrl+Shift+A in the game tab.\n`);
}

(async () => {
  const found = await existingSidecar();

  if (found?.other) {
    console.error(
      `\n  Something is already on port ${PORT}, and it is not the sidecar — it ${found.other}.\n` +
        `  Free the port, or run with a different one:  RBC_PORT=8788 npm start\n` +
        `  (the extension posts to 8787, so changing it means changing the extension too)\n`
    );
    process.exit(1);
  }

  if (found?.ours) {
    // Left running on purpose or by accident, either way it works. Not killed
    // on exit below, because this process did not start it.
    console.log(
      `\x1b[36m[sidecar]\x1b[0m already running on ${SIDECAR} — using it ` +
        `(${found.ours.received} snapshot(s) seen)`
    );
    startCoach();
    return;
  }

  run("sidecar", [path.join(ROOT, "sidecar", "server.js")], "36");
  // A moment's head start, so the coach's first poll does not print a "cannot
  // reach the sidecar" line that is true for 200 ms and confusing for longer.
  setTimeout(startCoach, 400);
})();
