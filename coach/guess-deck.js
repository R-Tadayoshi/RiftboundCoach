#!/usr/bin/env node
/* Write a decklist for the opponent, from the seeded builds and what they
 * have shown this game.
 *
 * The engine needs a list for both players. Ours is known. Theirs is not, and
 * it matters more than it looks: their unseen hand is sampled from whatever is
 * left of the list we supply, so a wrong list makes the ranking average over
 * cards they are not holding and miss the ones they are.
 *
 * What this does NOT do is invent a plausible deck. It picks a seeded build
 * that the evidence supports, and refuses when the evidence does not support
 * one. A guessed list dressed up as knowledge would put a percentage on a
 * simulation of a different deck — the exact failure the rest of this project
 * spends its time refusing.
 */
"use strict";

const fs = require("fs");
const archetypes = require("./archetypes.js");
const { loadIndex, resolve } = require("./alpharune.js");

/* How much evidence is enough.
 *
 * A build with nothing against it but nothing for it either is not a guess,
 * it is a default. Requiring some positive evidence means a game where the
 * opponent has shown nothing produces a refusal rather than a coin flip. */
const MIN_MATCHES = 3;

/** Score a build against what the opponent has actually shown. */
function scoreBuild(build) {
  const { matches = [], sideOnly = [], absent = [] } = build.evidence || {};
  return {
    name: build.name,
    matches: matches.length,
    sideOnly: sideOnly.length,
    absent: absent.length,
    /* A card seen that the build does not contain is strong evidence against
     * it; a card seen that it does contain is weaker evidence for, since
     * staples appear everywhere. Sideboard hits count for little. */
    score: matches.length + sideOnly.length * 0.25 - absent.length * 2,
  };
}

/**
 * Pick a build for the opponent.
 * Returns {ok:true, build, ranked} or {ok:false, why, ranked}.
 */
function guess(snapshot, { minMatches = MIN_MATCHES } = {}) {
  const prior = archetypes.priorFor(snapshot);
  if (!prior || !prior.entry) {
    return { ok: false, why: "nothing seeded for this champion — see coach/seed.js" };
  }

  const builds = archetypes.variantsFor(prior.entry, snapshot);
  if (!builds.length) {
    return { ok: false, why: `"${prior.champion || "that champion"}" has no seeded builds` };
  }

  const ranked = builds
    .map((b) => ({ build: b, ...scoreBuild(b) }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  if (top.matches < minMatches) {
    return {
      ok: false,
      why:
        `the best-matching build shares only ${top.matches} card(s) with what ` +
        `they have shown (need ${minMatches}). Too little to choose a list — ` +
        `sampling their hand from the wrong deck is worse than not ranking.`,
      ranked,
    };
  }
  if (ranked.length > 1 && ranked[1].score >= top.score) {
    return {
      ok: false,
      why:
        `"${top.name}" and "${ranked[1].name}" fit the evidence equally well. ` +
        `Pick one by hand if you know which they are playing.`,
      ranked,
    };
  }
  return { ok: true, build: top.build, chosen: top, ranked };
}

/* Deck files are the same headed format the engine reads, so a list written
 * here feeds it unchanged. Names are written as the ENGINE names them — a
 * legend is printed with its champion tag and named without it — so the file
 * loads rather than failing line by line. */
function toDeckFile(build, { index } = {}) {
  index = index || loadIndex();
  const unknown = [];

  const engineName = (name) => {
    const r = resolve(index, { name });
    if (r.miss) { unknown.push({ name, why: r.why }); return null; }
    return r.card.name;
  };

  const out = [];
  const section = (heading, entries) => {
    if (!entries.length) return;
    out.push(`${heading}:`);
    for (const { copies, name } of entries) {
      const n = engineName(name);
      if (n) out.push(`${copies} ${n}`);
    }
    out.push("");
  };

  if (build.legend) section("Legend", [{ copies: 1, name: build.legend }]);
  section("MainDeck", build.cards.map((c) => ({ copies: c.copies, name: c.name })));
  section("Battlefields", build.battlefields.map((n) => ({ copies: 1, name: n })));
  section("Sideboard", build.sideboard.map((n) => ({ copies: 1, name: n })));

  return { text: out.join("\n") + "\n", unknown };
}

function main() {
  const [snapshotFile, outFile] = process.argv.slice(2);
  if (!snapshotFile) {
    console.error("usage: node coach/guess-deck.js <snapshot.json> [out.txt]");
    process.exit(2);
  }
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
  const g = guess(snapshot);

  if (g.ranked) {
    console.error("builds, best fit first:");
    for (const r of g.ranked) {
      console.error(
        `  ${r.score.toFixed(2).padStart(7)}  ${r.name}  ` +
          `(${r.matches} seen in it, ${r.absent} seen that are not)`
      );
    }
    console.error("");
  }
  if (!g.ok) {
    console.error(`no decklist: ${g.why}`);
    process.exit(1);
  }

  const { text, unknown } = toDeckFile(g.build);
  if (unknown.length) {
    console.error(`${unknown.length} card(s) in that build the engine does not have:`);
    for (const u of unknown) console.error(`  ${u.name}`);
    console.error(
      `\nThe list below leaves them out, so it is NOT the deck they are playing. ` +
        `A ranking from it is about a different deck.`
    );
    process.exit(1);
  }

  if (outFile) { fs.writeFileSync(outFile, text); console.error(`wrote ${outFile}`); }
  else process.stdout.write(text);
}

if (require.main === module) main();
module.exports = { guess, toDeckFile, scoreBuild, MIN_MATCHES };
