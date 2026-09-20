#!/usr/bin/env node
/* Generate engine card files for a set the engine does not have.
 *
 * The metagame is defined by the newest set, so an engine frozen one set back
 * cannot reason about the decks people bring. VEN is 197 cards and the engine
 * predates it entirely.
 *
 * What this generates is the CardDef — name, type, cost, might, domains, tags,
 * keywords, printed text. Not behaviour. A card whose text does something will
 * come out as a STUB: the engine will happily play it as a blank.
 *
 * That is safe here ONLY because coach/fidelity.js exists. It derives which
 * cards are really implemented and blocks any search touching one that is not,
 * so a generated stub cannot quietly poison a ranking — it stops it. Without
 * that gate this script would be a machine for producing confident wrong
 * answers, and should not be run.
 *
 * What it buys immediately: decks containing these cards LOAD, so positions
 * can be built and inspected, and the LLM coach (which reads card text from
 * RiftScribe and never needed the engine) keeps working. Bodies can then be
 * written card by card, with the gate opening as each one lands.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ALPHARUNE =
  process.env.ALPHARUNE_ROOT || path.join(__dirname, "..", "..", "chorlick", "alpharune");

const TYPE_DIR = {
  unit: "units", spell: "spells", gear: "gear",
  legend: "legends", battlefield: "battlefields", rune: "runes",
};
const CARD_TYPE = {
  unit: "Unit", spell: "Spell", gear: "Gear",
  rune: "Rune", battlefield: "Battlefield", legend: "Legend",
};
const BASE_CLASS = {
  unit: "UnitCard", spell: "SpellCard", gear: "GearCard",
  rune: "RuneCard", battlefield: "BattlefieldCard", legend: "LegendCard",
};
const DOMAIN = { fury: "Fury", calm: "Calm", mind: "Mind", body: "Body", chaos: "Chaos", order: "Order" };
const RARITY = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", showcase: "Showcase" };
const SUPER = { champion: "Champion", signature: "Signature", token: "Token" };

/* Keywords the engine handles centrally. A card declaring one of these needs
 * no code for it. Anything else in the text is behaviour someone must write. */
const KEYWORDS = new Set([
  "accelerate", "action", "ambush", "assault", "backline", "deathknell",
  "deflect", "equip", "ganking", "hidden", "hunt", "legion", "level",
  "predict", "quickdraw", "reaction", "repeat", "shield", "tank",
  "temporary", "unique", "vision", "weaponmaster",
]);

/** C++ raw-string literal. R"RB(...)RB" survives anything but the delimiter. */
const raw = (s) => `R"RB(${String(s ?? "").replace(/\)RB"/g, ") RB\"")})RB"`;

const className = (name) =>
  name.replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("") || "Card";

const fileStem = (card) =>
  `${String(card.collector_number).padStart(4, "0")}_` +
  card.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Keywords the card declares, as engine enum names. */
function keywordsOf(card) {
  const found = new Set();
  for (const k of card.keywords || []) {
    const key = String(k).toLowerCase().replace(/[^a-z]/g, "");
    if (KEYWORDS.has(key)) found.add(key);
  }
  for (const m of (card.description || "").matchAll(/\[([A-Za-z][A-Za-z ]{1,24}?)(?:\s+\d+)?\]/g)) {
    const key = m[1].toLowerCase().replace(/[^a-z]/g, "");
    if (KEYWORDS.has(key)) found.add(key);
  }
  return [...found].map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .map((k) => (k === "Quickdraw" ? "QuickDraw" : k));
}

/** The numeric rider on [Assault 2] / [Shield 3] / [Deflect 2], default 1. */
function keywordValue(text, keyword) {
  const m = new RegExp(`\\[${keyword}(?:\\s+(\\d+))?\\]`, "i").exec(text || "");
  if (!m) return 0;
  return m[1] ? Number(m[1]) : 1;
}

function generate(card, id) {
  const type = String(card.type || "unit").toLowerCase();
  const cls = className(card.name);
  const kws = keywordsOf(card);
  const text = card.description || "";

  const lines = [];
  const d = (s) => lines.push(`        ${s}`);

  d(`d.id = ${id};`);
  d(`d.def_id = ${raw(card.id)};`);
  d(`d.name = ${raw(card.name)};`);
  d(`d.set_code = ${raw(card.set_id)};`);
  d(`d.set_name = ${raw(card.set_name || card.set_id)};`);
  d(`d.public_code = ${raw(card.public_code)};`);
  d(`d.collector_number = ${card.collector_number};`);
  if (card.art?.artist) d(`d.artist = ${raw(card.art.artist)};`);
  d(`d.card_type = CardType::${CARD_TYPE[type] || "Unit"};`);
  if (card.super_type && SUPER[String(card.super_type).toLowerCase()]) {
    d(`d.super_type = SuperType::${SUPER[String(card.super_type).toLowerCase()]};`);
  }

  const domains = (card.domains || [])
    .map((x) => DOMAIN[String(x).toLowerCase()])
    .filter(Boolean);
  if (domains.length) d(`d.domains = {${domains.map((x) => `Domain::${x}`).join(", ")}};`);
  if ((card.tags || []).length) d(`d.tags = {${card.tags.map(raw).join(", ")}};`);

  const st = card.stats || {};
  if (typeof st.energy === "number") d(`d.energy_cost = ${st.energy};`);
  if (typeof st.power === "number") d(`d.power_cost = ${st.power};`);
  if (typeof st.might === "number") d(`d.might = ${st.might};`);
  d(`d.rarity = Rarity::${RARITY[String(card.rarity || "common").toLowerCase()] || "Common"};`);

  for (const k of kws) d(`d.keywords.set(Keyword::${k});`);
  for (const [kw, field] of [["Assault", "assault_value"], ["Shield", "shield_value"], ["Deflect", "deflect_value"]]) {
    const v = keywordValue(text, kw);
    if (v) d(`d.${field} = ${v};`);
  }

  if (text) d(`d.ability_text = ${raw(text)};`);
  if (card.image) d(`d.image_url = ${raw(card.image)};`);

  return `#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"

#include <memory>

namespace riftbound {
namespace {

// GENERATED by coach/gen-cards.js — card data only, no behaviour.
// ${text ? "This card's printed text needs an implementation; until one exists\n// the engine plays it as a blank and coach/fidelity.js blocks any search\n// that touches it." : "This card is vanilla: its data IS its behaviour."}
class ${cls} : public ${BASE_CLASS[type] || "UnitCard"} {
public:
    const CardDef& def() const override { return def_; }
private:
    const CardDef def_ = [] {
        CardDef d;
${lines.join("\n")}
        return d;
    }();
};

}  // anonymous namespace

void register_card_${id}(CardRegistry& r) {
    r.registerCard(${id}, std::make_unique<${cls}>());
}

} // namespace riftbound
`;
}

/** The highest card id the engine already uses, so new ones do not collide. */
function highestId(root) {
  let max = 0;
  const dir = path.join(root, "src", "cards");
  for (const sub of fs.readdirSync(dir)) {
    const p = path.join(dir, sub);
    if (!fs.statSync(p).isDirectory()) continue;
    for (const f of fs.readdirSync(p)) {
      if (!f.endsWith(".cpp")) continue;
      for (const m of fs.readFileSync(path.join(p, f), "utf8").matchAll(/d\.id\s*=\s*(\d+);/g)) {
        max = Math.max(max, Number(m[1]));
      }
    }
  }
  return max;
}

function main() {
  const setId = (process.argv[2] || "").toUpperCase();
  const write = process.argv.includes("--write");
  if (!setId) {
    console.error("usage: node coach/gen-cards.js <SET> [--write]");
    console.error("  without --write it reports what it would generate and stops");
    process.exit(2);
  }

  const cacheFile = path.join(__dirname, "..", "state", "sets", `${setId.toLowerCase()}.json`);
  if (!fs.existsSync(cacheFile)) {
    console.error(`No cached set at ${cacheFile} — run: node coach/fetch-set.js ${setId}`);
    process.exit(1);
  }
  const cards = Object.values(JSON.parse(fs.readFileSync(cacheFile, "utf8")));

  const base = highestId(ALPHARUNE);
  const planned = cards.map((c, i) => ({ card: c, id: base + 1 + i }));

  let vanilla = 0, stubs = 0;
  for (const { card } of planned) ((card.description || "").trim() ? stubs++ : vanilla++);

  console.log(`${setId}: ${cards.length} cards, ids ${base + 1}..${base + cards.length}`);
  console.log(`  ${vanilla} vanilla — complete as generated`);
  console.log(`  ${stubs} with printed text — generated as STUBS, blocked by the fidelity gate`);

  if (!write) {
    console.log(`\nDry run. Pass --write to emit files into ${ALPHARUNE}/src/cards/.`);
    return;
  }

  const written = [];
  for (const { card, id } of planned) {
    const type = String(card.type || "unit").toLowerCase();
    const dir = path.join(ALPHARUNE, "src", "cards", TYPE_DIR[type] || "units");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${fileStem(card)}.cpp`);
    fs.writeFileSync(file, generate(card, id));
    written.push({ id, file });
  }

  // The aggregator is generated; extend it rather than hand-editing.
  const initFile = path.join(ALPHARUNE, "src", "cards", "cards_init.cpp");
  let init = fs.readFileSync(initFile, "utf8");
  const decls = written.map((w) => `void register_card_${w.id}(CardRegistry&);`).join("\n");
  const calls = written.map((w) => `    register_card_${w.id}(registry);`).join("\n");
  init = init.replace(/(\nvoid registerAllCards)/, `\n${decls}\n$1`);
  init = init.replace(/\n\}\s*\n\s*\} \/\/ namespace riftbound\s*$/, `\n${calls}\n}\n\n} // namespace riftbound\n`);
  fs.writeFileSync(initFile, init);

  console.log(`\nwrote ${written.length} card file(s) and updated cards_init.cpp`);
  console.log(`rebuild: (cd ${ALPHARUNE} && cmake --build build)`);
}

if (require.main === module) main();
module.exports = { generate, keywordsOf, keywordValue, className, fileStem, highestId };
