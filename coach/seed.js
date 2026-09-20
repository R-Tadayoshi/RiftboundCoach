#!/usr/bin/env node
/* Seed an archetype from a decklist, instead of waiting to face it.
 *
 *   node coach/seed.js "Jayce, Brilliant Inventor" decks/jayce.txt
 *   node coach/seed.js --list
 *   node coach/seed.js --forget "Jayce, Brilliant Inventor"
 *
 * The list is read the way decklists are written — one card per line, with an
 * optional count — and each entry is resolved against the card API, so a
 * typo is reported rather than stored. Nothing is invented: a line that does
 * not resolve to exactly one card is refused and named.
 *
 *   3 OGN-099
 *   2 Dredge Up
 *   Platewyrm Egg
 *   # comments and blank lines are ignored
 *
 * A seeded card is marked as such. It is a different kind of evidence from one
 * observed across games — a decklist says what the archetype plays, a sighting
 * says what THIS opponent played — and the prompt distinguishes them so the
 * model can weigh them differently.
 */
"use strict";

const fs = require("node:fs");
const cards = require("./cards.js");
const archetypes = require("./archetypes.js");

const CODE_RE = /^([A-Za-z]{2,4}-\d{1,4})$/;
const LINE_RE = /^\s*(?:(\d+)\s*[xX]?\s+)?(.+?)\s*$/;

function parseList(text) {
  const entries = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const hit = LINE_RE.exec(line);
    if (!hit) continue;
    entries.push({ count: Number(hit[1] || 1), token: hit[2].trim() });
  }
  return entries;
}

async function resolveEntry(token) {
  if (CODE_RE.test(token)) {
    try {
      return { card: await cards.fetchCard(token) };
    } catch (err) {
      return { error: `no card with code ${token}` };
    }
  }
  const found = await cards.findByName(token);
  if (!found) return { error: `no card named "${token}"` };
  if (found.ambiguous) {
    return { error: `"${token}" matches several: ${found.ambiguous.join(", ")}` };
  }
  return { card: found };
}

async function seed(champion, file) {
  const entries = parseList(fs.readFileSync(file, "utf8"));
  if (!entries.length) {
    console.error(`[seed] ${file} has no card lines.`);
    process.exitCode = 1;
    return;
  }

  const store = archetypes.load();
  const entry = (store[champion] = store[champion] || { matches: [], cards: {} });
  const failures = [];
  let added = 0;

  for (const { token, count } of entries) {
    const { card, error } = await resolveEntry(token);
    if (error) {
      failures.push(error);
      continue;
    }
    const code = card.code;
    const held = (entry.cards[code] = entry.cards[code] || { name: card.name, matches: [] });
    held.name = card.name;
    held.seeded = true;
    held.copies = count;
    added += 1;
    console.log(`  + ${card.name.padEnd(28)} ${code}${count > 1 ? `  x${count}` : ""}`);
  }

  archetypes.save(store);
  console.log(`\n[seed] ${added} card(s) seeded for "${champion}".`);
  if (failures.length) {
    console.error(`[seed] ${failures.length} line(s) not stored:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

function list() {
  const store = archetypes.load();
  const names = Object.keys(store);
  if (!names.length) return console.log("[seed] nothing known yet.");
  for (const name of names) {
    const entry = store[name];
    const all = Object.values(entry.cards);
    const seeded = all.filter((c) => c.seeded).length;
    console.log(
      `${name}\n  ${entry.matches.length} game(s) played, ${all.length} card(s) known` +
        `${seeded ? ` (${seeded} seeded from a list)` : ""}`
    );
  }
}

function forget(champion) {
  const store = archetypes.load();
  if (!(champion in store)) {
    console.error(`[seed] nothing stored for "${champion}".`);
    process.exitCode = 1;
    return;
  }
  delete store[champion];
  archetypes.save(store);
  console.log(`[seed] forgot "${champion}".`);
}

async function main() {
  const [a, b] = process.argv.slice(2);
  if (a === "--list") return list();
  if (a === "--forget") return forget(b);
  if (!a || !b) {
    console.error(
      'usage: node coach/seed.js "<Champion>" <decklist.txt>\n' +
        "       node coach/seed.js --list\n" +
        '       node coach/seed.js --forget "<Champion>"'
    );
    process.exitCode = 1;
    return;
  }
  await seed(a, b);
}

if (require.main === module) main();

module.exports = { parseList, resolveEntry, seed };
