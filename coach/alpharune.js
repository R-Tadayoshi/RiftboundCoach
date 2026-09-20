#!/usr/bin/env node
/* The bridge between this project's card identities and alpharune's.
 *
 * The coach names cards the way RiftScribe does — a public code like
 * "SFD-057/221", or just a name off the board. The engine names them its own
 * way: an internal integer id, a def_id ("sfd-246-221"), and a public_code.
 * Nothing works until those agree, so this is the first thing to get right and
 * the cheapest thing to get wrong.
 *
 * Two facts about the mapping, both checked against cards/card_index.json
 * rather than assumed:
 *
 *   1. The index holds 787 entries under 767 distinct names. The 20 repeats
 *      are cross-set reprints — Lonely Poro is in SFD-036 and UNL-221 with the
 *      same cost, might and text — so when a name is ambiguous the choice does
 *      not matter. Ambiguity here is not the hazard it was in cards.js.
 *
 *   2. Variant printings are NOT all present. Blade Dancer exists in the index
 *      only as SFD-246 (showcase); the SFD-195 printing that RiftScribe
 *      returns has no entry and no C++ class. So an exact public-code match
 *      alone would fail to find a card the engine implements perfectly well.
 *
 * Hence: try the code, then the base code, then the name. Report what could
 * not be found rather than guessing at it — a deck that half-maps produces a
 * position that is quietly wrong, which is the worst kind.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_ROOT =
  process.env.ALPHARUNE_ROOT || path.join(__dirname, "..", "..", "chorlick", "alpharune");

/** "SFD-057/221" and "SFD-057" and "sfd-057-221" all reduce to "SFD-057". */
function baseCode(code) {
  if (!code) return null;
  const m = /([A-Za-z]{2,4})[-_]?(\d{1,4})/.exec(String(code));
  return m ? `${m[1].toUpperCase()}-${String(Number(m[2])).padStart(3, "0")}` : null;
}

const normalName = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/* Sets the engine knows. It predates VEN entirely — 166 cards, none of them
 * present — so a deck drawing on VEN cannot be modelled at all, and a miss
 * from this checker is very likely a VEN card rather than a typo. */
function coveredSets(index) {
  const sets = {};
  for (const c of index.rows) {
    const s = c.set || c.set_code;
    if (s) sets[s] = (sets[s] || 0) + 1;
  }
  return sets;
}

function loadIndex(root = DEFAULT_ROOT) {
  const file = path.join(root, "cards", "card_index.json");
  if (!fs.existsSync(file)) {
    throw new Error(
      `alpharune card index not found at ${file}. Set ALPHARUNE_ROOT to the ` +
        `checkout, or clone chorlick/alpharune beside this repo.`
    );
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Array.isArray(raw) ? raw : raw.cards || raw.data || [];

  const byCode = new Map();
  const byName = new Map();
  for (const c of rows) {
    if (!c || !c.name) continue;
    const b = baseCode(c.public_code);
    if (b && !byCode.has(b)) byCode.set(b, c);
    const n = normalName(c.name);
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(c);
  }
  return { rows, byCode, byName };
}

/* Two entries under one name are the same card in two sets only if they play
 * the same. Checked rather than trusted, because a name collision between
 * genuinely different cards would silently build the wrong board. */
/* null and 0 are the same cost.
 *
 * The engine's own index writes null for a card with no power cost; a card
 * imported by coach/gen-cards.js wrote 0. So "Irelia, Fervent" — the same card
 * printed in SFD-057 and reprinted in VEN-174 — compared as two different
 * cards, and resolving her name became an ambiguity error. A reprint is the
 * commonest thing in a card game; the comparison has to survive one. */
const cost = (v) => (v === null || v === undefined ? 0 : v);

const sameCard = (a, b) =>
  cost(a.energy_cost) === cost(b.energy_cost) &&
  cost(a.power_cost) === cost(b.power_cost) &&
  cost(a.might) === cost(b.might) &&
  a.card_type === b.card_type;

/* RiftAtlas prints a legend as "<champion tag>, <card name>" — the board says
 * "Irelia, Blade Dancer" and the card is called "Blade Dancer". No legend name
 * in the index contains a comma (checked: 40 legends, zero), so a leading
 * "Something, " on a name that otherwise misses is the tag, not part of it.
 * alpharune's own decks are written the long way too ("Draven, Glorious
 * Executioner" for the card "Glorious Executioner"), so this is needed to read
 * the engine's own deck files, never mind ours. */
function nameVariants(name) {
  const out = [normalName(name)];
  const comma = /^[^,]+,\s*(.+)$/.exec(String(name || ""));
  if (comma) out.push(normalName(comma[1]));
  return out;
}

/** Resolve by code, then by name. Returns {card, how} or {miss, why}. */
function resolve(index, { code, name }) {
  const b = baseCode(code);
  if (b && index.byCode.has(b)) return { card: index.byCode.get(b), how: "code" };

  let hits = [];
  let how = b ? "name (code absent)" : "name";
  for (const [i, variant] of nameVariants(name).entries()) {
    const found = index.byName.get(variant) || [];
    if (found.length) {
      hits = found;
      if (i > 0) how = "name (champion tag stripped)";
      break;
    }
  }
  if (hits.length === 1) return { card: hits[0], how };
  if (hits.length > 1) {
    const consistent = hits.every((h) => sameCard(h, hits[0]));
    if (consistent) return { card: hits[0], how: `name (${hits.length} identical printings)` };
    return {
      miss: true,
      why: `"${name}" matches ${hits.length} entries that do NOT play the same — ` +
        hits.map((h) => `${h.public_code} E${h.energy_cost}/M${h.might}`).join(", "),
    };
  }
  return { miss: true, why: `no entry for ${name}${code ? ` (${code})` : ""}` };
}

/* Deck files use the same headed format on both sides — Legend:, Champion:,
 * MainDeck:, Battlefields:, Runes:, Sideboard: — so a list written for the
 * coach feeds the engine unchanged. */
function parseDeckNames(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || /^[A-Za-z]+:$/.test(t)) continue;
    const m = /^(\d+)\s+(.+?)\s*$/.exec(t);
    if (m) out.push({ count: Number(m[1]), name: m[2].trim() });
  }
  return out;
}

function checkDeck(file, index) {
  const entries = parseDeckNames(fs.readFileSync(file, "utf8"));
  const misses = [];
  let cards = 0;
  for (const e of entries) {
    cards += e.count;
    const r = resolve(index, { name: e.name });
    if (r.miss) misses.push({ ...e, why: r.why });
  }
  return { file: path.basename(file), lines: entries.length, cards, misses };
}

function main() {
  const args = process.argv.slice(2);
  const index = loadIndex();
  const sets = coveredSets(index);
  console.log(
    `alpharune index: ${index.rows.length} cards, ${index.byName.size} distinct names\n` +
      `sets covered: ${Object.entries(sets).map(([s, n]) => `${s} (${n})`).join(", ")}\n` +
      `a miss below is a name this index has no entry for — a typo, a variant ` +
      `printing, or a set that has not been imported yet (coach/fetch-set.js).\n`
  );

  const files = args.filter((a) => !a.startsWith("--"));
  if (!files.length) {
    console.log("usage: node coach/alpharune.js <deck.txt> [more.txt ...]");
    process.exit(0);
  }

  let bad = 0;
  for (const f of files) {
    const r = checkDeck(f, index);
    const ok = r.lines - r.misses.length;
    console.log(
      `${r.misses.length ? "FAIL" : " OK "}  ${r.file}  — ${ok}/${r.lines} lines map (${r.cards} cards)`
    );
    for (const m of r.misses) console.log(`        ${m.count} ${m.name}: ${m.why}`);
    if (r.misses.length) bad += 1;
  }
  process.exit(bad ? 1 : 0);
}

if (require.main === module) main();
module.exports = { loadIndex, resolve, baseCode, parseDeckNames, checkDeck, sameCard, coveredSets, nameVariants };
