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

/* A keyword printed AFTER an [Empowered] gate is not one the card has.
 *
 * "[Empowered][>] I have [Assault 3]" means the card has Assault while a
 * latch is set, and the latch starts clear. Put on the CardDef it is
 * unconditional, so an un-Empowered Shadow Fiend attacks as a 5 for
 * [2][Fury] — strictly better than the printed card, and wrong in the
 * direction a search will find and exploit. Thirteen VEN cards were
 * generated that way.
 *
 * Reminder text in parentheses is stripped first, or "(+3 Might while I'm an
 * attacker.)" — which follows the gate and mentions nothing gated — would
 * drag the next keyword in with it.
 *
 * The keyword is still in the printed text, so the card is still STUB and
 * still needs a body; this only stops the DATA claiming something the card
 * does not have. */
function ungatedKeywordText(description) {
  const bare = String(description || "").replace(/\([^()]*\)/g, "");
  const at = bare.search(/\[Empowered\]/);
  return at < 0 ? bare : bare.slice(0, at);
}

/* A keyword the card GIVES is not one the card HAS.
 *
 * The [Empowered] gate was one way a keyword reached a CardDef with no claim
 * to it; the grant clause is the other. "When I attack, you may pay [Fury]
 * to give me [Assault 2] this turn" starts without Assault and may buy it.
 * Read off the text unconditionally, Baccai Reaper becomes a 3-cost 4-Might
 * that attacks as a 6 for free — the same silent overperformance as the
 * gate, in the same direction a search finds first. Twenty-five cards in the
 * engine were carrying one, most of them from before this generator existed.
 *
 * The window is FROM THE START OF THE SENTENCE to the keyword, not the
 * sentence as a whole, because the two ends of the rule pull opposite ways:
 *
 *   Jayce, Hammer in Hand: "choose one to give me this turn —[Assault 2]
 *   ...[Deflect 2] ...[Ganking]" — one "give" governs three keywords with
 *   no punctuation between them, so proximity is not enough.
 *
 *   Poppy, Paragon: "[Deflect] (reminder) ... give ..." — stripping the
 *   reminder leaves the printed keyword in the same sentence as a later
 *   grant, so dropping the whole sentence would lose a keyword the card
 *   genuinely has.
 *
 * A keyword printed once and granted once keeps it: the printed occurrence
 * has no grant verb ahead of it and that is enough. */
const GRANT_VERB = /\b(gives?|gains?|grants?|granted)\b/i;

function grantedAt(text, index) {
  const before = String(text).slice(0, index);
  const cut = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"),
                       before.lastIndexOf("?"));
  return GRANT_VERB.test(before.slice(cut + 1));
}

/** Keywords the card declares, as engine enum names. */
function keywordsOf(card) {
  const found = new Set();
  for (const k of card.keywords || []) {
    const key = String(k).toLowerCase().replace(/[^a-z]/g, "");
    if (KEYWORDS.has(key)) found.add(key);
  }
  const ungated = ungatedKeywordText(card.description);
  for (const m of ungated.matchAll(/\[([A-Za-z][A-Za-z ]{1,24}?)(?:\s+\d+)?\]/g)) {
    const key = m[1].toLowerCase().replace(/[^a-z]/g, "");
    if (!KEYWORDS.has(key)) continue;
    if (grantedAt(ungated, m.index)) continue;
    found.add(key);
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
  // Only for a keyword the card actually has. Reading the value off the raw
  // text regardless is how Lord Broadmane ended up with assault_value = 1
  // and Chakram Dancer with shield_value = 1 from clauses that grant those
  // keywords to their OTHER units.
  for (const [kw, field] of [["Assault", "assault_value"], ["Shield", "shield_value"], ["Deflect", "deflect_value"]]) {
    if (!kws.includes(kw)) continue;
    const v = keywordValue(ungatedKeywordText(text), kw);
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

/* Every card the engine already has, as def_id -> id, plus the highest id in
 * use. Both are needed to make generation idempotent, and idempotence is not
 * a nicety here: the first version took `highest id + 1` for everything, so
 * running it twice rewrote all 197 files with fresh ids while the aggregator
 * still called the old ones. The result does not link, and the reason is
 * nowhere near the symptom. */
function scanIds(root) {
  const byDefId = new Map();
  let max = 0;
  const dir = path.join(root, "src", "cards");
  for (const sub of fs.readdirSync(dir)) {
    const p = path.join(dir, sub);
    if (!fs.statSync(p).isDirectory()) continue;
    for (const f of fs.readdirSync(p)) {
      if (!f.endsWith(".cpp")) continue;
      const text = fs.readFileSync(path.join(p, f), "utf8");
      const id = /d\.id\s*=\s*(\d+);/.exec(text);
      const def = /d\.def_id\s*=\s*R"RB\(([^)]*)\)RB"/.exec(text);
      if (id) max = Math.max(max, Number(id[1]));
      if (id && def) byDefId.set(def[1], Number(id[1]));
    }
  }
  return { byDefId, max };
}

/** Kept for the tests and for callers that only want the ceiling. */
const highestId = (root) => scanIds(root).max;

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

  const { byDefId, max } = scanIds(ALPHARUNE);
  let next = max + 1;
  /* A card the engine already has keeps its id, whether it came from a
   * previous run of this script or was hand-written. Re-generating must not
   * renumber anything. */
  const planned = cards.map((card) => {
    const existing = byDefId.get(card.id);
    return { card, id: existing ?? next++, fresh: existing === undefined };
  });
  const regenerated = planned.filter((p) => !p.fresh).length;

  let vanilla = 0, stubs = 0;
  for (const { card } of planned) ((card.description || "").trim() ? stubs++ : vanilla++);

  const freshIds = planned.filter((p) => p.fresh).map((p) => p.id);
  console.log(
    `${setId}: ${cards.length} cards` +
      (freshIds.length ? `, ${freshIds.length} new at ids ${freshIds[0]}..${freshIds[freshIds.length - 1]}` : "") +
      (regenerated ? `, ${regenerated} already present (ids preserved)` : "")
  );
  console.log(`  ${vanilla} vanilla — complete as generated`);
  console.log(`  ${stubs} with printed text — generated as STUBS, blocked by the fidelity gate`);

  if (!write) {
    console.log(`\nDry run. Pass --write to emit files into ${ALPHARUNE}/src/cards/.`);
    return;
  }

  /* The marker a generated file carries. Its absence means someone wrote the
   * card by hand, and regenerating would throw that away — silently, since
   * the build still succeeds and the card simply stops working. Four cards
   * were one careless re-run from exactly that. */
  const GENERATED_MARKER = "GENERATED by coach/gen-cards.js";

  const written = [];
  const preserved = [];
  for (const { card, id } of planned) {
    const type = String(card.type || "unit").toLowerCase();
    const dir = path.join(ALPHARUNE, "src", "cards", TYPE_DIR[type] || "units");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${fileStem(card)}.cpp`);

    if (fs.existsSync(file) && !fs.readFileSync(file, "utf8").includes(GENERATED_MARKER)) {
      preserved.push({ id, file, name: card.name });
      written.push({ id, file });   // still needs registering
      continue;
    }
    fs.writeFileSync(file, generate(card, id));
    written.push({ id, file });
  }
  if (preserved.length) {
    console.log(`\nleft alone (hand-written, no generated marker):`);
    for (const p2 of preserved) console.log(`  ${p2.name}`);
  }

  /* The card index is the engine's own manifest, and everything on our side
   * resolves names through it — the fidelity gate, the position translator,
   * the deck checker. Writing the C++ without writing the index leaves the
   * new cards invisible: present in the binary, absent from every check.
   * Fails closed, so nothing breaks, but nothing improves either. */
  const indexFile = path.join(ALPHARUNE, "cards", "card_index.json");
  const indexRaw = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  const rows = Array.isArray(indexRaw) ? indexRaw : indexRaw.cards || indexRaw.data || [];
  const have = new Set(rows.map((r) => r.id));
  let added = 0;
  for (const { card } of planned) {
    if (have.has(card.id)) continue;
    rows.push({
      id: card.id,
      name: card.name,
      set: card.set_id,
      set_name: card.set_name || card.set_id,
      collector_number: card.collector_number,
      public_code: card.public_code,
      card_type: String(card.type || "unit").toLowerCase(),
      super_type: card.super_type ?? null,
      domains: (card.domains || []).map((d) => String(d).toLowerCase()),
      tags: card.tags || [],
      /* null, not 0, for an absent cost — matching the engine's own index.
       * Writing 0 made a reprint compare unequal to its original and turned
       * resolving that card's name into an ambiguity error. */
      energy_cost: card.stats?.energy ?? null,
      power_cost: card.stats?.power ?? null,
      might: card.stats?.might ?? null,
      might_bonus: null,
      rarity: String(card.rarity || "common").toLowerCase(),
      ability_text: card.description || "",
      effect_text: "",
      image_url: card.image || "",
      artist: card.art?.artist ?? null,
    });
    added += 1;
  }
  fs.writeFileSync(indexFile, JSON.stringify(Array.isArray(indexRaw) ? rows : indexRaw, null, 1));
  console.log(`added ${added} card(s) to ${path.basename(indexFile)}`);

  // The aggregator is generated; extend it rather than hand-editing.
  const initFile = path.join(ALPHARUNE, "src", "cards", "cards_init.cpp");
  let init = fs.readFileSync(initFile, "utf8");
  // Only add registrations the aggregator does not already carry.
  const fresh = written.filter((w) => !new RegExp(`register_card_${w.id}\\(`).test(init));
  if (!fresh.length) {
    console.log(`\nwrote ${written.length} card file(s); cards_init.cpp already registers them`);
    return;
  }
  const decls = fresh.map((w) => `void register_card_${w.id}(CardRegistry&);`).join("\n");
  const calls = fresh.map((w) => `    register_card_${w.id}(registry);`).join("\n");
  init = init.replace(/(\nvoid registerAllCards)/, `\n${decls}\n$1`);
  init = init.replace(/\n\}\s*\n\s*\} \/\/ namespace riftbound\s*$/, `\n${calls}\n}\n\n} // namespace riftbound\n`);
  fs.writeFileSync(initFile, init);

  console.log(`\nwrote ${written.length} card file(s), registered ${fresh.length} new`);
  console.log(`rebuild: (cd ${ALPHARUNE} && cmake --build build)`);
}

if (require.main === module) main();
module.exports = { generate, keywordsOf, keywordValue, className, fileStem, highestId, scanIds };
