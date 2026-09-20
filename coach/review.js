#!/usr/bin/env node
/* Review a finished game and write down what it taught.
 *
 *   node coach/review.js              review the game the sidecar last saw
 *   node coach/review.js --dry-run    show the review prompt, send nothing
 *   node coach/review.js --note "..." record one lesson by hand, no LLM
 *
 * The hand-written form exists because you are a better source than the model
 * is: when the coach suggests something illegal mid-game and you correct it,
 * that correction is ground truth and should go in directly.
 */
"use strict";

const { ask } = require("./openrouter.js");
const lessons = require("./lessons.js");

const SIDECAR = process.env.RBC_SIDECAR || "http://127.0.0.1:8787";

const SYSTEM = `You are reviewing a finished game of Riftbound to extract what
transfers to future games.

Write at most FIVE lessons, each one line, each starting with "- ".

What counts as a lesson:
- A decision pattern that paid off or cost the game, stated so it applies
  again: "conquering an uncontested battlefield early is usually worth more
  than holding runes for a trick that never came."
- A recurring mistake worth naming.

What does NOT count, and must not appear:
- Anything about this specific board that will not recur.
- Restatements of the rules. The coach already has the rulebook.
- Card-specific trivia unless the card decided the game.
- Anything you are not confident about. Fewer, surer lessons beat five weak
  ones — an unsound lesson is read back later as knowledge and repeated.

If the game shows nothing transferable, say exactly: NO LESSONS.`;

function describeGame(history) {
  const first = history[0];
  const last = history[history.length - 1];
  const me = last.players?.self;
  const them = last.players?.opponent;

  /* The log is the record of what was actually done; the snapshots either
   * side of it give the outcome. */
  const log = (last.log || []).map((e) => `${e.at} [${e.actor}] ${e.text}`).join("\n");

  return `GAME ${last.match?.roomCode ?? "?"} — ${last.match?.mode ?? "?"}
turns: ${first.match?.turnNumber ?? "?"} to ${last.match?.turnNumber ?? "?"}
final score: ${me?.name ?? "me"} ${me?.score ?? "?"} — ${them?.score ?? "?"} ${them?.name ?? "them"}
my legend: ${me?.legend ?? "?"}   my champion: ${me?.champion ?? "?"}
their legend: ${them?.legend ?? "?"}   their champion: ${them?.champion ?? "?"}
battlefields: ${last.battlefields?.battlefieldA?.name ?? "?"}, ${last.battlefields?.battlefieldB?.name ?? "?"}

GAME LOG
${log || "(no log captured)"}`;
}

async function reviewLastGame({ dryRun }) {
  let history;
  try {
    const res = await fetch(`${SIDECAR}/history?n=200`);
    history = await res.json();
  } catch (err) {
    console.error(`[review] cannot reach the sidecar at ${SIDECAR}: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (!Array.isArray(history) || !history.length) {
    console.error("[review] the sidecar holds no snapshots — nothing to review.");
    process.exitCode = 1;
    return;
  }

  /* One game only. The sidecar's history can span several, and lessons drawn
   * across a room change would be drawn from two different boards. */
  const room = history[history.length - 1].match?.roomCode;
  const game = history.filter((s) => s.match?.roomCode === room);

  const user = describeGame(game);
  console.log(`[review] ${game.length} snapshot(s) from room ${room}\n`);

  if (dryRun) {
    console.log("[system]\n" + SYSTEM + "\n\n[user]\n" + user);
    return;
  }

  let text;
  try {
    ({ text } = await ask({ system: SYSTEM, user }));
  } catch (err) {
    console.error("[review] " + err.message);
    process.exitCode = 1;
    return;
  }

  if (/^\s*NO LESSONS/i.test(text)) {
    console.log("[review] nothing transferable from this game.");
    return;
  }

  const entries = text
    .split("\n")
    .filter((l) => l.trim().startsWith("- "))
    .map((l) => l.trim().slice(2));

  if (!entries.length) {
    console.log("[review] the review produced no lesson lines:\n" + text);
    return;
  }

  const { added, total, dropped } = lessons.add(entries, `room ${room}`);
  console.log(`[review] ${added} new lesson(s), ${total} held${dropped ? `, ${dropped} aged out` : ""}:\n`);
  for (const e of entries) console.log("  - " + e);
  console.log(`\n[review] stored in ${lessons.FILE} — read them, and delete any that look wrong.`);
}

function note(text) {
  if (!text || !text.trim()) {
    console.error('usage: node coach/review.js --note "what you learned"');
    process.exitCode = 1;
    return;
  }
  const { added, total } = lessons.add([text], "noted by hand");
  console.log(
    added
      ? `[review] recorded. ${total} lesson(s) held.`
      : "[review] already held — nothing added."
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const noteAt = argv.indexOf("--note");
  if (noteAt >= 0) return note(argv.slice(noteAt + 1).join(" "));
  await reviewLastGame({ dryRun: argv.includes("--dry-run") });
}

if (require.main === module) main();

module.exports = { describeGame, SYSTEM, reviewLastGame };
