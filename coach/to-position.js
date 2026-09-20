#!/usr/bin/env node
/* Turn a board we captured into a position the engine can rebuild.
 *
 * The last link in the chain. Everything upstream reads the live board and
 * everything downstream ranks moves; this is the piece that makes them the
 * same board.
 *
 * Two rules govern it, and both come from the same instinct: a position that
 * is quietly wrong is worse than no position, because the ranking that comes
 * out of it still carries a percentage.
 *
 *   1. Every card must map to something the engine implements. A card the
 *      engine has never heard of, or has as a stub whose text does nothing,
 *      poisons every number downstream. coach/fidelity.js decides; anything
 *      short of OK stops the translation.
 *
 *   2. Whatever cannot be represented is SAID, not skipped. Hidden zones, an
 *      unreadable count, an opponent hand we can only count — each one is a
 *      way the constructed board differs from the real one, and the caller
 *      has to be able to see the list.
 */
"use strict";

const fs = require("fs");
const { loadIndex, resolve } = require("./alpharune.js");
const { scanCardFiles, verdictFor } = require("./fidelity.js");

const SIDE = { me: "P1", them: "P2" };

/* The engine's zones, against ours. `hand` on the opponent's side is the one
 * that cannot cross: we know how many cards they hold and not which, which is
 * the whole point of the extractor's visibility rule. */
const ZONE = {
  hand: "hand",
  base: "base",
  battlefieldA: "bfA",
  battlefieldB: "bfB",
  trash: "trash",
};

function line(...parts) {
  return parts.join(" ");
}

/** Build the position script. Returns {script, caveats, blocked}. */
function toPosition(summary, { index, files } = {}) {
  index = index || loadIndex();
  files = files || scanCardFiles();

  const out = [];
  const caveats = [];
  const blocked = [];

  const engineName = (card) => {
    const r = resolve(index, { code: card.code, name: card.name });
    if (r.miss) {
      blocked.push({ name: card.name, code: card.code, why: r.why });
      return null;
    }
    const v = verdictFor(r.card, files);
    if (v.verdict !== "OK") {
      blocked.push({ name: r.card.name, code: card.code, why: v.why });
      return null;
    }
    return r.card.name;
  };

  out.push("# Generated from a captured board by coach/to-position.js.");
  out.push("# Card names are the ENGINE's names, which differ from the board's:");
  out.push("# a legend is printed with its champion tag and named without it.");
  out.push("");
  out.push(line("clear", "P1", "all"));
  out.push(line("clear", "P2", "all"));
  out.push("");

  if (typeof summary.turn?.number === "number") out.push(line("turn", summary.turn.number));
  out.push(line("phase", "main"));
  out.push(line("turnplayer", summary.turn?.isMyTurn === false ? "P2" : "P1"));
  if (summary.turn?.isMyTurn !== true) {
    caveats.push("the capture is not on my turn — ranking my moves from it is meaningless");
  }
  out.push("");

  for (const [key, tag] of Object.entries(SIDE)) {
    const side = summary[key];
    if (!side) continue;
    if (typeof side.score === "number") out.push(line("score", tag, side.score));
  }
  out.push("");

  /* Runes become a spendable pool rather than rune cards, because what the
   * engine needs to decide legality is what can be paid right now. A rune that
   * is ready can give 1 energy OR 1 power, and an exhausted one can still be
   * recycled for power — so the energy ceiling is the ready count and the
   * power ceiling is every rune on board. */
  const me = summary.me;
  if (me?.runes) {
    const ready = (me.runes.ready || 0) + (me.runes.unknown || 0);
    out.push(line("energy", "P1", ready));
    out.push(line("power", "P1", me.runes.total ?? ready));
    if (me.runes.unknown) {
      caveats.push(`${me.runes.unknown} of my runes were unreadable and are assumed ready`);
    }
  }
  out.push("");

  for (const [key, tag] of Object.entries(SIDE)) {
    const side = summary[key];
    if (!side) continue;

    /* A legend cannot be placed — it comes from the deck file. So the
     * position asserts it, and the loader fails on a mismatch. A legend sits
     * in play all game and its abilities are usually the cheapest line a
     * player has; ranking a position whose legend is not the one on screen
     * produces numbers about a different game. */
    if (side.legendCard?.name) {
      const n = engineName(side.legendCard);
      if (n) {
        out.push(line("expect", "legend", tag, n));
        if (side.legendCard.exhausted === true) {
          caveats.push(
            `${tag}'s legend ${n} is exhausted on the board; the engine will ` +
              `have it ready, so its ability looks available when it is not`
          );
        }
      }
    }

    for (const [ourZone, theirZone] of Object.entries(ZONE)) {
      const cards = side[ourZone] || [];
      if (!cards.length) continue;

      if (key === "them" && ourZone === "hand") continue; // handled below
      for (const card of cards) {
        const n = engineName(card);
        if (!n) continue;
        const state =
          card.exhausted === true ? " exhausted" : card.exhausted === false ? " ready" : "";
        out.push(line("place", tag, n, theirZone) + state);
      }
    }
  }

  /* Their hand is a count, never contents — the extractor refuses to read it
   * even when the client renders it. The engine needs cards, so it gets
   * whatever the deal gave, and that difference is stated rather than hidden. */
  if (typeof summary.them?.handCount === "number" && summary.them.handCount > 0) {
    out.push("");
    out.push(`# ${summary.them.handCount} cards we can count and never read.`);
    out.push(line("hidden", "P2", summary.them.handCount));
    caveats.push(
      `their ${summary.them.handCount} hand card(s) are sampled fresh per ` +
        `rollout from what is left of their deck — so the ranking averages ` +
        `over what they might hold, not over one guess`
    );
  }

  /* Our own deck order is unknown to us too, but our HAND is not: it is
   * placed card by card above. So nothing of ours is hidden, and saying
   * "hidden P1 0" would be noise. */

  return { script: out.join("\n") + "\n", caveats, blocked };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node coach/to-position.js <snapshot-or-summary.json> [out.txt]");
    process.exit(2);
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  // Accept either a raw snapshot or an already-summarised board.
  const summary = raw.me && raw.them ? raw : require("./summarize.js").summarize(raw);

  const { script, caveats, blocked } = toPosition(summary);

  if (blocked.length) {
    console.error(`REFUSING: ${blocked.length} card(s) the engine cannot model faithfully.\n`);
    for (const b of blocked) console.error(`  ${b.name}${b.code ? ` (${b.code})` : ""}: ${b.why}`);
    console.error(
      `\nA ranking built on these would still print a percentage. That is the ` +
        `problem with it.`
    );
    process.exit(1);
  }

  const out = process.argv[3];
  if (out) {
    fs.writeFileSync(out, script);
    console.log(`wrote ${out}`);
  } else {
    process.stdout.write(script);
  }

  if (caveats.length) {
    console.error(`\nHow this position differs from the real board:`);
    for (const c of caveats) console.error(`  - ${c}`);
  }
}

if (require.main === module) main();
module.exports = { toPosition };
