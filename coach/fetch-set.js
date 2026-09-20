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

  /* Blur placeholders and thumbnail sets are a quarter-megabyte of base64
   * that nothing downstream reads. Dropped so the cache is a card list rather
   * than an image cache — 480K becomes 126K, small enough to keep in the
   * repository, which makes the import reproducible without a network. */
  const slim = {};
  for (const [id, card] of Object.entries(cached)) {
    const { image_blur_data_url, image_thumb, art, ...rest } = card;
    slim[id] = art?.artist ? { ...rest, art: { artist: art.artist } } : rest;
  }
  fs.writeFileSync(cacheFile, JSON.stringify(slim, null, 1));
  return { cards: Object.values(slim), fetched, cacheFile };
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

/* The engine's keyword enum, read from its source rather than copied here.
 * A copy goes stale silently; the enum is the truth. */
function engineKeywords(root) {
  const fs2 = require("fs");
  const p2 = require("path");
  root = root || process.env.ALPHARUNE_ROOT ||
    p2.join(__dirname, "..", "..", "chorlick", "alpharune");
  for (const rel of [["src", "core", "types.h"], ["src", "core", "types.hpp"]]) {
    const f = p2.join(root, ...rel);
    if (!fs2.existsSync(f)) continue;
    const m = /enum\s+class\s+Keyword\s*:[^{]*\{([^}]*)\}/.exec(fs2.readFileSync(f, "utf8"));
    if (!m) continue;
    return new Set(
      m[1]
        .split(",")
        .map((e) => e.split("=")[0].trim().toLowerCase())
        .filter((e) => e && e !== "count")
    );
  }
  return null;
}

/* Keywords a set uses that the engine has no enum value for.
 *
 * This exists because I got it wrong by hand. I ran the check against the
 * set INDEX, whose records carry no `description` at all, and reported "VEN
 * introduces no new keywords" from 197 empty strings. Zarkhil knew the set and
 * asked about Empowered. It is on 59 cards.
 *
 * So the check refuses to run on textless data rather than returning a
 * comfortable answer about it. */
function newKeywords(cards, engineSet) {
  const withText = cards.filter((c) => (c.description || "").trim());
  if (!withText.length) {
    throw new Error(
      `none of these ${cards.length} cards carry text — this is the index, not ` +
        `the full records, and a keyword scan over it would find nothing and ` +
        `mean nothing.`
    );
  }
  const engine = engineSet || engineKeywords();
  const counts = new Map();
  for (const c of withText) {
    for (const m of (c.description || "").matchAll(/\[([A-Za-z][A-Za-z ]{1,24}?)(?:\s+\d+)?\]/g)) {
      const k = m[1].toLowerCase().replace(/[^a-z]/g, "");
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  const known = [];
  const unknown = [];
  for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    (engine && engine.has(k) ? known : unknown).push({ keyword: k, cards: n });
  }
  return { known, unknown, engineKnown: !!engine };
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

  /* Cards are work. A keyword the engine has never heard of is a different
   * kind of work — an engine change — so it is reported separately and
   * loudly. */
  let kw;
  try {
    kw = newKeywords(cards);
  } catch (err) {
    console.log(`\nKeyword scan skipped: ${err.message}`);
    return;
  }
  if (!kw.engineKnown) {
    console.log(`\nKeyword scan skipped: could not read the engine's Keyword enum.`);
    return;
  }
  console.log(
    `\nKeywords already in the engine: ${kw.known.map((k) => k.keyword).join(", ") || "(none)"}`
  );
  if (!kw.unknown.length) {
    console.log(`No keyword in this set is new to the engine.`);
    return;
  }
  console.log(`\nNEW MECHANICS — these need engine work, not just cards:`);
  for (const { keyword, cards: n } of kw.unknown) {
    console.log(`  ${keyword.padEnd(14)} on ${String(n).padStart(3)} card(s)`);
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { fetchSet, listSet, classify, residualText, newKeywords, engineKeywords };
