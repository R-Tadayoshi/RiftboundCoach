/* What this opponent's champion has actually shown you, across matches.
 *
 * Fine-tuning is the wrong tool for this and a hand-written meta file is a
 * worse one. What makes a prior useful here is that it is TRUE of the people
 * you actually play, and the extractor already watches every card an opponent
 * commits to the board. So the knowledge is accumulated rather than authored:
 * play against Akali four times and the file knows what Akali decks in your
 * pod are playing, with no curation and nothing invented.
 *
 * Only public cards are recorded — base, battlefields, runes and trash, the
 * things both players can see. A hand never reaches this file because the
 * extractor withheld it before this file was called.
 *
 * The store is plain JSON on purpose: you can open it, correct it, or seed it
 * by hand with cards you know an archetype plays but have not yet faced.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { baseCode } = require("./cards.js");

const STORE =
  process.env.RBC_ARCHETYPES || path.resolve(__dirname, "..", "state", "archetypes.json");

/* Zones an opponent's cards are public in. `hand` is absent by design, not by
 * oversight: it is withheld upstream and must not be learned from here. */
const PUBLIC_ZONES = ["base", "battlefieldA", "battlefieldB", "runeArea", "trash"];

/* Runes are in every deck of a domain and say nothing about an archetype, so
 * recording them would bury the cards that do. */
const RUNE_NAME_RE = /\bRune$/i;

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch (_) {
    return {};
  }
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[coach] could not write the archetype store:", err.message);
  }
}

/** The key an opponent's deck is filed under. */
function archetypeKey(snapshot) {
  const them = snapshot?.players?.opponent;
  return them?.champion || them?.legend || null;
}

/** Every public card of theirs on the board right now. */
function publicCards(snapshot) {
  const zones = snapshot?.zones?.opponent || {};
  const out = [];
  for (const zone of PUBLIC_ZONES) {
    for (const card of zones[zone]?.visible || []) {
      if (!card.code || !card.name) continue; // tokens carry no code
      if (RUNE_NAME_RE.test(card.name)) continue;
      // An alternate printing is the same card; normalise before comparing.
      out.push({ code: baseCode(card.code), name: card.name });
    }
  }
  return out;
}

/* Fold this snapshot into what we know, keyed by match so a card played three
 * times in one game counts once. Returns the updated record. */
function observe(snapshot, store) {
  const data = store || load();
  const key = archetypeKey(snapshot);
  const matchId = snapshot?.match?.roomCode;
  if (!key || !matchId) return data;

  const entry = (data[key] = data[key] || { matches: [], cards: {} });
  if (!entry.matches.includes(matchId)) entry.matches.push(matchId);

  for (const { code, name } of publicCards(snapshot)) {
    const card = (entry.cards[code] = entry.cards[code] || { name, matches: [] });
    if (!card.matches.includes(matchId)) card.matches.push(matchId);
  }

  if (!store) save(data);
  return data;
}

/* What to expect from this champion, most reliably seen first.
 *
 * Returns null rather than an empty prior when there is no history: a coach
 * told "you have seen nothing" may treat that as evidence of absence, and one
 * match is not a read. */
function priorFor(snapshot, store, minMatches = 0) {
  const data = store || load();
  const key = archetypeKey(snapshot);
  if (!key || !data[key]) return null;

  const entry = data[key];
  const played = entry.matches.length;
  // A seeded list is worth having before a single game has been played, so
  // the match floor only gates the observed half.
  if (played < minMatches) return null;

  /* Two kinds of evidence, kept apart. A decklist says what the archetype
   * plays; a sighting says what THIS opponent played. Collapsing them into one
   * number would make a seeded card look like a game it was never seen in. */
  const all = Object.entries(entry.cards).map(([code, card]) => ({
    code,
    name: card.name,
    seen: card.matches.length,
    of: played,
    seeded: !!card.seeded,
    copies: card.copies ?? null,
  }));

  const observed = all
    .filter((c) => c.seen > 0)
    .sort((a, b) => b.seen - a.seen || a.name.localeCompare(b.name));
  const seeded = all
    .filter((c) => c.seeded && c.seen === 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const variants = variantsFor(entry, snapshot);

  if (!observed.length && !seeded.length && !variants.length) return null;
  return { champion: key, matchesPlayed: played, cards: observed, seeded, variants };
}

/* Which seeded build the cards on the table are consistent with.
 *
 * A champion can be piloted as more than one deck — the Heron build and the
 * Protect-the-Queen build share a champion and little else — so builds are
 * stored separately and never merged. A prior that says "they might have any
 * of these eighty cards" is not a prior.
 *
 * What makes them useful is that this game narrows them. Every public card an
 * opponent plays either appears in a build or does not, so a card outside a
 * build is evidence against it. Reported as evidence, not as a verdict: a
 * tech card or a sideboard swap should shade a read, not overturn it, and
 * ruling a build out on one card would do more harm than the prior does good.
 */
function variantsFor(entry, snapshot) {
  const builds = Object.values(entry.variants || {});
  if (!builds.length) return [];

  const seenNow = publicCards(snapshot || {});
  return builds.map((build) => {
    const inMain = (code) => code in (build.main || {});
    const inSide = (code) => code in (build.sideboard || {});

    const matches = seenNow.filter((c) => inMain(c.code)).map((c) => c.name);
    const sideOnly = seenNow.filter((c) => !inMain(c.code) && inSide(c.code)).map((c) => c.name);
    const absent = seenNow.filter((c) => !inMain(c.code) && !inSide(c.code)).map((c) => c.name);

    return {
      name: build.name,
      legend: build.legend || null,
      cards: Object.values(build.main || {})
        .map((c) => ({ name: c.name, copies: c.copies }))
        .sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name)),
      battlefields: Object.values(build.battlefields || {}).map((c) => c.name),
      runes: build.runes || [],
      sideboard: Object.values(build.sideboard || {}).map((c) => c.name),
      evidence: { matches: [...new Set(matches)], sideOnly: [...new Set(sideOnly)], absent: [...new Set(absent)] },
    };
  });
}

module.exports = {
  observe,
  priorFor,
  variantsFor,
  publicCards,
  archetypeKey,
  load,
  save,
  STORE,
  PUBLIC_ZONES,
};
