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
      out.push({ code: card.code, name: card.name });
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
function priorFor(snapshot, store, minMatches = 1) {
  const data = store || load();
  const key = archetypeKey(snapshot);
  if (!key || !data[key]) return null;

  const entry = data[key];
  const played = entry.matches.length;
  if (played < minMatches) return null;

  const cards = Object.entries(entry.cards)
    .map(([code, card]) => ({
      code,
      name: card.name,
      seen: card.matches.length,
      of: played,
    }))
    .filter((c) => c.seen > 0)
    .sort((a, b) => b.seen - a.seen || a.name.localeCompare(b.name));

  if (!cards.length) return null;
  return { champion: key, matchesPlayed: played, cards };
}

module.exports = { observe, priorFor, publicCards, archetypeKey, load, save, STORE, PUBLIC_ZONES };
