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

run("sidecar", [path.join(ROOT, "sidecar", "server.js")], "36");

// A moment's head start, so the coach's first poll does not print a "cannot
// reach the sidecar" line that is true for 200 ms and confusing for longer.
setTimeout(() => {
  run("coach", [path.join(ROOT, "coach", "index.js"), "--serve", ...passthrough], "35");
  console.log("\n  Open \x1b[4mhttp://127.0.0.1:8787\x1b[0m — or press Ctrl+Shift+A in the game tab.\n");
}, 400);
