/* Card text, from RiftScribe's public API, cached on disk.
 *
 * https://riftscribe.gg/api/cards/<CODE> - no key, no auth. A card's text
 * never changes, so a hit is cached permanently; only a miss costs a request.
 * A whole match touches a few dozen distinct cards, so after the first game or
 * two this is almost entirely local.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const API = "https://riftscribe.gg/api/cards";
const CACHE_FILE =
  process.env.RBC_CARD_CACHE || path.resolve(__dirname, "..", "state", "cards.json");

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch (_) {
    cache = {};
  }
  return cache;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error("[coach] could not write the card cache:", err.message);
  }
}

/* Only the fields a coach reasons about. The API returns artwork URLs and
 * pagination neighbours too, and carrying those into a prompt would spend
 * tokens on nothing. */
/* Alternate printings share a name and a card, differing only by a letter on
 * the collector number: VEN-068 and VEN-068a are both Jayce, Brilliant
 * Inventor. Codes are normalised to the base so a decklist and a board that
 * happen to use different printings still match. */
function baseCode(code) {
  // Trailing letters mark an alternate art, a trailing * a foil treatment.
  return (code || "").replace(/^([A-Za-z]{2,4}-\d{1,4})[a-z*]+$/i, "$1");
}

function distil(card) {
  const code = baseCode(card.public_code?.split("/")[0] || null);
  return {
    code,
    codes: [code],
    name: card.name,
    type: card.type,
    domains: card.domains || [],
    energy: card.stats?.energy ?? null,
    might: card.stats?.might ?? null,
    power: card.stats?.power ?? null,
    text: card.description || "",
    keywords: card.keywords || [],
  };
}

async function fetchCard(code) {
  const res = await fetch(`${API}/${encodeURIComponent(code)}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} for ${code}`);
  return distil(await res.json());
}

/* Resolve many codes, hitting the network only for ones not already held.
 *
 * A card that cannot be resolved is recorded as null and not retried within
 * the run: a missing card should cost one failed lookup and a gap in the
 * prompt, not a stalled coaching loop every turn. */
async function resolve(codes) {
  const held = load();
  const missing = codes.filter((code) => !(code in held));

  for (const code of missing) {
    try {
      held[code] = await fetchCard(code);
    } catch (err) {
      console.error(`[coach] card ${code} not resolved: ${err.message}`);
      held[code] = null;
    }
  }
  if (missing.length) save();

  const out = {};
  for (const code of codes) if (held[code]) out[code] = held[code];
  return out;
}

/* Find a card by name, for seeding a decklist written the way people write
 * decklists. Exact matches win; a partial match is returned only when it is
 * the single hit, so "Dredge" finding one card resolves and finding four does
 * not silently pick the first. */
async function findByName(name) {
  const res = await fetch(`${API}?q=${encodeURIComponent(name)}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} searching for ${name}`);
  const hits = await res.json();
  if (!Array.isArray(hits) || !hits.length) return null;

  const wanted = name.trim().toLowerCase();
  const exact = hits.filter((c) => (c.name || "").trim().toLowerCase() === wanted);
  if (exact.length === 1) return distil(exact[0]);

  if (exact.length > 1) {
    /* Several exact matches are one card in several printings — an alternate
     * art, a foil, or a reprint in a later set. "Irelia, Fervent" is in three
     * sets, so requiring a single code refused a perfectly ordinary card.
     *
     * A card is therefore a name plus the SET of codes it has been printed
     * under. Any of them on the board is that card. The base printing in the
     * earliest set is the one reported, so a store written today still reads
     * the same after a reprint adds a code. */
    const codes = [...new Set(exact.map((c) => baseCode(c.public_code.split("/")[0])))].sort();
    const primary = exact.find((c) => !c.variant) || exact[0];
    return { ...distil(primary), codes };
  }
  if (hits.length === 1) return distil(hits[0]);
  return { ambiguous: hits.slice(0, 6).map((c) => `${c.public_code} ${c.name}`) };
}

module.exports = { resolve, fetchCard, findByName, distil, baseCode, CACHE_FILE, API };
