#!/usr/bin/env node
/* The coaching loop.
 *
 * Watches the sidecar for a new authoritative state, and when the turn is the
 * player's, asks for a line and prints it.
 *
 *   node coach/index.js              coach on each of my turns
 *   node coach/index.js --dry-run    build and print the prompt, send nothing
 *   node coach/index.js --once       coach the current state, then exit
 *   node coach/index.js --every      coach on every change, not just my turns
 */
"use strict";

const { summarize, codesToResolve } = require("./summarize.js");
const { SYSTEM, buildUserMessage } = require("./prompt.js");
const { ask, DEFAULT_MODEL } = require("./openrouter.js");
const cards = require("./cards.js");

const SIDECAR = process.env.RBC_SIDECAR || "http://127.0.0.1:8787";
const POLL_MS = Number(process.env.RBC_POLL_MS || 1500);

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const ONCE = args.has("--once");
const EVERY = args.has("--every");

/* Solo practice only, checked again here.
 *
 * The extractor already refuses to capture anything else, so this should never
 * fire. It is here because the guard that matters is the one nearest the
 * thing being guarded: if a snapshot ever reaches this process from somewhere
 * else, the coach still will not run on a live match against another person. */
const SOLO_MODES = new Set(["single_player", "solo_lab"]);

let lastSequence = null;

async function readState() {
  const res = await fetch(`${SIDECAR}/state`);
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`sidecar ${res.status}`);
  return res.json();
}

function shouldCoach(snapshot) {
  if (!snapshot || snapshot.error) return false;
  if (snapshot.sequence !== null && snapshot.sequence === lastSequence) return false;

  const mode = snapshot.match?.mode;
  if (!SOLO_MODES.has(mode)) {
    console.log(`[coach] "${mode}" is not solo practice — standing down.`);
    return false;
  }
  if (snapshot.connection?.state && snapshot.connection.state !== "open") {
    console.log(`[coach] connection is "${snapshot.connection.state}"; the board may be stale.`);
    return false;
  }
  if (!EVERY && snapshot.match?.isMyTurn !== true) return false;
  return true;
}

function banner(snapshot) {
  const m = snapshot.match || {};
  const me = snapshot.players?.self?.name ?? "?";
  const them = snapshot.players?.opponent?.name ?? "?";
  return (
    `\n${"─".repeat(64)}\n` +
    `turn ${m.turnNumber ?? "?"} · ${m.turnStep ?? "?"} · ` +
    `${me} ${snapshot.players?.self?.score ?? "?"} — ` +
    `${snapshot.players?.opponent?.score ?? "?"} ${them}\n` +
    `${"─".repeat(64)}`
  );
}

async function coach(snapshot) {
  lastSequence = snapshot.sequence;

  const summary = summarize(snapshot);
  const cardText = await cards.resolve(codesToResolve(snapshot));
  const user = buildUserMessage(summary, cardText);

  console.log(banner(snapshot));

  if (DRY_RUN) {
    console.log("\n[system]\n" + SYSTEM + "\n\n[user]\n" + user);
    return;
  }

  try {
    const { text, model, usage } = await ask({ system: SYSTEM, user });
    console.log("\n" + text + "\n");
    console.log(
      `  — ${model}${usage ? `, ${usage.prompt_tokens}+${usage.completion_tokens} tokens` : ""}`
    );
  } catch (err) {
    console.error("[coach] " + err.message);
  }

  for (const w of snapshot.warnings || []) console.error("[coach] board warning: " + w);
}

async function tick() {
  let snapshot;
  try {
    snapshot = await readState();
  } catch (err) {
    console.error(`[coach] cannot reach the sidecar at ${SIDECAR} — is it running? (${err.message})`);
    return false;
  }
  if (!snapshot) return false;
  if (!shouldCoach(snapshot)) return false;
  await coach(snapshot);
  return true;
}

async function main() {
  console.log(`[coach] watching ${SIDECAR}`);
  console.log(`[coach] model: ${DRY_RUN ? "(dry run — nothing is sent)" : DEFAULT_MODEL}`);
  console.log(`[coach] ${EVERY ? "coaching every change" : "coaching on my turns"}\n`);

  if (ONCE) {
    await tick();
    return;
  }
  for (;;) {
    await tick();
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[coach] " + err.stack);
    process.exit(1);
  });
}

module.exports = { shouldCoach, summarize, SOLO_MODES };
