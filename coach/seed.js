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
const path = require("node:path");
const cards = require("./cards.js");
const archetypes = require("./archetypes.js");

const CODE_RE = /^([A-Za-z]{2,4}-\d{1,4})$/;
const LINE_RE = /^\s*(?:(\d+)\s*[xX]?\s+)?(.+?)\s*$/;
const SECTION_RE = /^\s*([A-Za-z][A-Za-z ]*?)\s*:\s*$/;

/* Section headings as Rift Atlas exports them, mapped to where each belongs.
 * Anything unrecognised is kept under `main` rather than dropped, so an export
 * that grows a section does not silently lose cards. */
const SECTIONS = {
  legend: "legend",
  champion: "champion",
  maindeck: "main",
  "main deck": "main",
  deck: "main",
  battlefields: "battlefields",
  battlefield: "battlefields",
  runes: "runes",
  rune: "runes",
  sideboard: "sideboard",
};

function sectionFor(heading) {
  return SECTIONS[heading.trim().toLowerCase().replace(/\s+/g, " ")] ?? "main";
}

/* Parse a decklist into its sections.
 *
 * A list with no headings at all is read as a main deck, so the simple form
 * (one card per line) still works. */
function parseDeck(text) {
  const out = { legend: [], champion: [], main: [], battlefields: [], runes: [], sideboard: [] };
  let section = "main";

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;

    const heading = SECTION_RE.exec(line);
    if (heading) {
      section = sectionFor(heading[1]);
      continue;
    }

    const hit = LINE_RE.exec(line);
    if (!hit) continue;
    out[section].push({ count: Number(hit[1] || 1), token: hit[2].trim() });
  }
  return out;
}

/** Kept for the plain one-card-per-line form. */
function parseList(text) {
  return parseDeck(text).main;
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

async function resolveSection(entries, report) {
  const out = {};
  for (const { token, count } of entries) {
    const { card, error } = await resolveEntry(token);
    if (error) {
      report.failures.push(error);
      continue;
    }
    // Every printing this card has, so a board using a reprint still matches.
    out[card.code] = { name: card.name, copies: count, codes: card.codes || [card.code] };
    report.resolved += 1;
  }
  return out;
}

/* A variant's name: what was passed, else the file's own name. Two builds of
 * one champion are different decks and must not be merged — a prior that says
 * "they might have any of these eighty cards" is no prior at all. */
function variantNameFor(explicit, file) {
  if (explicit) return explicit;
  const base = path.basename(file).replace(/\.[^.]+$/, "");
  return base.replace(/[-_]+/g, " ").trim() || "unnamed";
}

async function seed(file, options = {}) {
  const deck = parseDeck(fs.readFileSync(file, "utf8"));
  const report = { resolved: 0, failures: [] };

  /* The champion names the archetype, and the list already says who it is, so
   * it is read from the file rather than retyped on the command line. */
  let champion = options.champion || null;
  if (!champion && deck.champion.length) {
    const { card, error } = await resolveEntry(deck.champion[0].token);
    if (error) report.failures.push(`champion: ${error}`);
    else champion = card.name;
  }
  if (!champion) {
    console.error(
      "[seed] no champion. Give the list a `Champion:` section, or pass --champion \"Name\"."
    );
    process.exitCode = 1;
    return;
  }

  const variant = variantNameFor(options.variant, file);
  const store = archetypes.load();
  const entry = (store[champion] = store[champion] || { matches: [], cards: {} });
  entry.variants = entry.variants || {};

  const [main, battlefields, sideboard] = [
    await resolveSection(deck.main, report),
    await resolveSection(deck.battlefields, report),
    await resolveSection(deck.sideboard, report),
  ];

  entry.variants[variant] = {
    name: variant,
    source: path.basename(file),
    legend: deck.legend[0]?.token || null,
    main,
    battlefields,
    sideboard,
    // Runes are not cards an opponent might surprise you with, but the split
    // says which domains the deck can pay, which is worth carrying.
    runes: deck.runes.map((r) => ({ name: r.token, copies: r.count })),
  };

  archetypes.save(store);

  const counts = [
    `${Object.keys(main).length} main`,
    `${Object.keys(battlefields).length} battlefield`,
    `${Object.keys(sideboard).length} sideboard`,
  ].join(", ");
  console.log(`[seed] "${variant}" stored for ${champion} — ${counts}.`);
  if (entry.variants && Object.keys(entry.variants).length > 1) {
    console.log(
      `[seed] ${champion} now has ${Object.keys(entry.variants).length} builds: ` +
        Object.keys(entry.variants).join(", ")
    );
  }
  if (report.failures.length) {
    console.error(`[seed] ${report.failures.length} line(s) not stored:`);
    for (const f of report.failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

/* Seed every list in a directory.
 *
 * Dropping files into decks/ and expecting them to be read is the obvious
 * mental model, and until now the tool did not support it: a file sat there
 * doing nothing until it was named on the command line. Each file's name
 * becomes its build name, which is why the names are worth choosing. */
async function seedAll(dir) {
  let files;
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => /\.(txt|deck|list)$/i.test(f))
      .sort();
  } catch (err) {
    console.error(`[seed] cannot read ${dir}: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (!files.length) {
    console.error(`[seed] no .txt files in ${dir}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`[seed] reading ${files.length} list(s) from ${dir}\n`);
  for (const file of files) {
    await seed(path.join(dir, file), {});
  }
}

function list() {
  const store = archetypes.load();
  const names = Object.keys(store);
  if (!names.length) return console.log("[seed] nothing known yet.");
  for (const name of names) {
    const entry = store[name];
    const observed = Object.values(entry.cards || {}).length;
    console.log(`${name}`);
    console.log(`  ${entry.matches.length} game(s) played, ${observed} card(s) seen`);
    for (const v of Object.values(entry.variants || {})) {
      console.log(
        `  build "${v.name}" — ${Object.keys(v.main).length} main, ` +
          `${Object.keys(v.sideboard).length} sideboard  (${v.source})`
      );
    }
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

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--list") return list();
  if (argv[0] === "--forget") return forget(argv[1]);
  if (argv[0] === "--all") return seedAll(argv[1] || "decks");

  const file = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1]?.startsWith("--") !== true);
  if (!file) {
    console.error(
      "usage: node coach/seed.js <decklist.txt> [--name \"Heron\"] [--champion \"Name\"]\n" +
        "       node coach/seed.js --all [decks/]      read every list in a folder\n" +
        "       node coach/seed.js --list\n" +
        '       node coach/seed.js --forget "<Champion>"\n\n' +
        "Putting a file in decks/ does not read it — seed it, or use --all.\n" +
        "The champion is read from the list's `Champion:` section.\n" +
        "The build is named after the file unless --name says otherwise."
    );
    process.exitCode = 1;
    return;
  }
  await seed(file, { variant: flag(argv, "--name"), champion: flag(argv, "--champion") });
}

if (require.main === module) main();

module.exports = { parseDeck, parseList, sectionFor, resolveEntry, seed, seedAll };
