#!/usr/bin/env node
/* Pull a whole Riftbound set from RiftScribe, in the shape the engine wants.
 *
 * The engine (chorlick/alpharune) covers UNL, OGN, SFD and OGS — 787 cards —
 * and predates VEN entirely. Since the metagame is defined by the newest set,
 * an engine frozen one set back is an engine that cannot reason about the
 * decks people actually bring. So importing a set has to be a command, not a
 * project.
 *
 * alpharune's own `scripts/fetch_cards.py` reads the official League card
 * gallery, which this environment's network policy does not reach. RiftScribe
 * does, and serves the same facts:
 *
 *   /api/cards?set_id=VEN&limit=200&offset=N   the index (no card text)
 *   /api/cards/<CODE>                          the full record, with text
 *
 * Text only comes from the per-card endpoint, so this fetches both and caches
 * every record — a re-run after a new set costs only the new cards.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const API = "https://riftscribe.gg/api/cards";
const CACHE = path.join(__dirname, "..", "state", "sets");

/* Polite: a public fan API, fetched one card at a time rather than in a burst.
 * 197 cards at this spacing is about twenty seconds, which is nothing against
 * how often a set is released. */
const GAP_MS = Number(process.env.RBC_FETCH_GAP_MS || 120);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.ok) return res.json();
      // 4xx is an answer, not a hiccup — retrying will not change it.
      if (res.status < 500) throw new Error(`${res.status} for ${url}`);
    } catch (err) {
      if (i === tries - 1) throw err;
    }
    await sleep(400 * (i + 1));
  }
  throw new Error(`gave up on ${url}`);
}

/** Every base printing in a set. Variants are alternate art of a card that is
 *  already listed, and the engine keeps one entry per card. */
async function listSet(setId) {
  const out = new Map();
  for (let offset = 0; ; offset += 200) {
    const page = await getJson(`${API}?set_id=${encodeURIComponent(setId)}&limit=200&offset=${offset}`);
    if (!Array.isArray(page) || !page.length) break;
    for (const c of page) if (!c.variant && !out.has(c.id)) out.set(c.id, c);
    if (page.length < 200) break;
  }
  return [...out.values()].sort((a, b) => a.collector_number - b.collector_number);
}

async function fetchSet(setId, { onProgress } = {}) {
  fs.mkdirSync(CACHE, { recursive: true });
  const cacheFile = path.join(CACHE, `${setId.toLowerCase()}.json`);
  const cached = fs.existsSync(cacheFile)
    ? JSON.parse(fs.readFileSync(cacheFile, "utf8"))
    : {};

  const index = await listSet(setId);
  const cards = [];
  let fetched = 0;

  for (const row of index) {
    const code = row.public_code.split("/")[0];
    let full = cached[row.id];
    if (!full) {
      full = await getJson(`${API}/${encodeURIComponent(code)}`);
      cached[row.id] = full;
      fetched += 1;
      await sleep(GAP_MS);
    }
    cards.push(full);
    onProgress?.(cards.length, index.length, fetched);
  }

  fs.writeFileSync(cacheFile, JSON.stringify(cached, null, 1));
  return { cards, fetched, cacheFile };
}

/* Is this card's whole text just the reminder lines for keywords it already
 * declares? If so the engine needs no behaviour for it — keywords are
 * declarative on CardDef and handled centrally, so the card is pure data.
 *
 * Reminder text is the parenthesised half of "[Deflect] (Opponents must pay
 * [A] to choose me...)". Strip the bracketed keyword tokens and their
 * parentheses; whatever is left is real rules text needing a body. */
function residualText(card) {
  let t = (card.description || "").replace(/:rb_[a-z0-9_]+:/gi, "");
  t = t.replace(/\[[^\]]{1,24}\]/g, "");       // [Deflect], [>], [Deflect 2]
  t = t.replace(/\([^)]*\)/g, "");             // reminder text
  return t.replace(/\s+/g, " ").trim();
}

const classify = (card) =>
  !(card.description || "").trim()
    ? "vanilla"
    : !residualText(card)
    ? "keywords-only"
    : "needs-behaviour";

async function main() {
  const setId = (process.argv[2] || "").toUpperCase();
  if (!setId) {
    console.log("usage: node coach/fetch-set.js <SET>   e.g. VEN");
    process.exit(1);
  }

  process.stdout.write(`fetching ${setId} ... `);
  const { cards, fetched, cacheFile } = await fetchSet(setId, {
    onProgress: (n, total) => {
      if (n % 25 === 0 || n === total) process.stdout.write(`${n}/${total} `);
    },
  });
  console.log(`\n${cards.length} cards (${fetched} newly fetched)\ncached: ${cacheFile}\n`);

  const buckets = { vanilla: [], "keywords-only": [], "needs-behaviour": [] };
  for (const c of cards) buckets[classify(c)].push(c);

  console.log("How much of this set is free:");
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`  ${k.padEnd(16)} ${String(v.length).padStart(4)}  ${((v.length / cards.length) * 100).toFixed(0)}%`);
  }
  const free = buckets.vanilla.length + buckets["keywords-only"].length;
  console.log(
    `\n${free} of ${cards.length} are pure data — the engine needs no code for them.\n` +
      `${buckets["needs-behaviour"].length} carry rules text and need a hand-written body.`
  );
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { fetchSet, listSet, classify, residualText };
