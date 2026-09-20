#!/usr/bin/env node
/* Which of the engine's cards can actually be trusted in a search.
 *
 * For a search engine an unimplemented card is more dangerous than a missing
 * one. A missing card fails loudly at deck load. A card whose CardDef is
 * right and whose text does nothing plays perfectly happily — so the search
 * explores a board that is quietly wrong and returns a confident number about
 * it. That is the same failure as the ISMCTS resampler that Clone()s instead
 * of determinizing: not an error, an answer built on a false model.
 *
 * The engine offers no way to ask. `CardDef` has no fidelity field, and of 787
 * card files only 13 carry any "partial implementation" note. So fidelity is
 * derived here, from two facts that are both checkable:
 *
 *   1. Does the card's printed text require behaviour? (Text that is only
 *      keyword reminders does not — keywords are declarative on CardDef and
 *      the engine handles all 23 centrally.)
 *   2. Does its C++ file override a behaviour hook?
 *
 * Needs behaviour and has none → a stub, and any position containing it is
 * not safe to search. The verdict is deliberately pessimistic: a card this
 * cannot prove is implemented is treated as a stub, because the cost of being
 * wrong is a confident wrong answer.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { loadIndex, resolve, DEFAULT_ROOT } = require("./alpharune.js");
const { residualText } = require("./fetch-set.js");

const ROOT = process.env.ALPHARUNE_ROOT || path.join(__dirname, "..", "..", "chorlick", "alpharune");

/* Every hook a card can override to do something, read off the virtuals in
 * the engine's `cards/card.h`.
 *
 * The first version of this list came from the engine's own audit script and
 * covered only on(Resolve|Trigger|Activate|Play|Equip|Death). That missed
 * `applyReplacement`, and so called Guardian Angel a stub — a card whose
 * replacement effect is implemented in full, and which sits in the deck this
 * project was built around. A false STUB blocks a search that would have been
 * sound, which is the same sin as a false "illegal" in legality.js: it teaches
 * you to route around the check.
 *
 * So the list errs the other way. A card matching any of these is credited
 * with behaviour, and a card that overrode one of them pointlessly would only
 * cost us a search we could have refused. */
const BEHAVIOUR_HOOKS = [
  "onResolve", "onPlay", "onActivate", "onTrigger", "onEquip",
  "onEquippedTrigger", "applyReplacement", "applyPassiveAura",
  "hasReplacementEffect", "hasActivatedAbility", "hasEquipAbility",
  "activatedAbilities", "triggerType", "triggerTypes", "equippedTriggerType",
  "equippedKeywords", "equippedAssault", "equippedShield", "equippedDeflect",
  "optionalAdditionalCost", "alternativePlayCost", "getActivationCost",
  "canActivateAbility", "activationCostReduction", "restrictsPlayLocations",
  "getPlayLocations", "ambushToEnemyBattlefields", "crossesHoldConquerTriggers",
  "getTargetRequirements", "enumerateLegalTargets", "needsPlayTimeTarget",
  "needsPlayTimeTargetPair", "needsEquipTimeTarget", "isActionAbility",
  "isReactionAbility", "hasLegalTargets",
];
const BEHAVIOUR_RE = new RegExp(`\\b(?:${BEHAVIOUR_HOOKS.join("|")})\\s*\\([^;]*?\\)[^;{]*?override`, "s");

/* A card can also inherit behaviour from a shared base — SimpleEquipGear and
 * friends carry the keyword's mechanics — so deriving from anything other than
 * the plain type base counts too. */
const BASE_RE = /class\s+\w+\s*:\s*public\s+(?!UnitCard\b|SpellCard\b|GearCard\b|RuneCard\b|BattlefieldCard\b|LegendCard\b)\w+/;
const TRIGGER_RE = BASE_RE;

/** Every card file the engine has, keyed by def_id. */
function scanCardFiles(root = ROOT) {
  const dir = path.join(root, "src", "cards");
  const out = new Map();
  if (!fs.existsSync(dir)) return out;

  for (const sub of fs.readdirSync(dir)) {
    const subdir = path.join(dir, sub);
    if (!fs.statSync(subdir).isDirectory()) continue;
    for (const file of fs.readdirSync(subdir)) {
      if (!/^\d+_.*\.cpp$/.test(file)) continue;
      const text = fs.readFileSync(path.join(subdir, file), "utf8");
      for (const m of text.matchAll(/d\.def_id\s*=\s*R"RB\(([^)]*)\)RB"/g)) {
        out.set(m[1], {
          file: `${sub}/${file}`,
          hasBehaviour: BEHAVIOUR_RE.test(text) || BASE_RE.test(text),
        });
      }
    }
  }
  return out;
}

/** OK | STUB | ABSENT, with the reason. */
function verdictFor(card, files) {
  if (!card) return { verdict: "ABSENT", why: "no card in the engine" };
  const impl = files.get(card.id);
  if (!impl) return { verdict: "ABSENT", why: `no C++ file for ${card.id}` };

  const text = (card.ability_text || "") + " " + (card.effect_text || "");
  const needs = !!residualText({ description: text });
  if (!needs) return { verdict: "OK", why: "no behaviour needed (vanilla or keywords only)" };
  if (impl.hasBehaviour) return { verdict: "OK", why: `implemented in ${impl.file}` };
  return {
    verdict: "STUB",
    why: `text needs behaviour but ${impl.file} overrides none — the engine ` +
      `would play this card as if it did nothing`,
  };
}

/* The gate. Given the cards in a position, say whether a search over it can
 * be believed. Anything not provably OK blocks it. */
function gate(cardRefs, { index, files } = {}) {
  index = index || loadIndex(ROOT);
  files = files || scanCardFiles(ROOT);

  const blocking = [];
  const checked = [];
  for (const ref of cardRefs) {
    const r = resolve(index, ref);
    const v = verdictFor(r.card, files);
    const row = { ref, name: r.card?.name ?? ref.name, ...v };
    checked.push(row);
    if (v.verdict !== "OK") blocking.push(row);
  }
  return { safe: blocking.length === 0, blocking, checked };
}

function main() {
  const index = loadIndex(ROOT);
  const files = scanCardFiles(ROOT);
  if (!files.size) {
    console.error(`No card files under ${ROOT}/src/cards. Set ALPHARUNE_ROOT.`);
    process.exit(2);
  }

  const counts = { OK: 0, STUB: 0, ABSENT: 0 };
  const stubs = [];
  for (const card of index.rows) {
    const v = verdictFor(card, files);
    counts[v.verdict] += 1;
    if (v.verdict === "STUB") stubs.push(card);
  }

  const total = index.rows.length;
  console.log(`Engine card fidelity — ${total} cards\n`);
  for (const [k, n] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(7)} ${String(n).padStart(4)}  ${((n / total) * 100).toFixed(0)}%`);
  }
  console.log(
    `\nOK means the card needs no behaviour, or its file implements some.\n` +
      `STUB means its printed text needs behaviour and its file has none —\n` +
      `the engine plays it as a blank, and a search over it is not trustworthy.`
  );
  if (stubs.length) {
    console.log(`\nFirst few stubs:`);
    for (const c of stubs.slice(0, 10)) {
      console.log(`  ${c.public_code.padEnd(12)} ${c.name}`);
    }
  }
}

if (require.main === module) main();
module.exports = { scanCardFiles, verdictFor, gate, BEHAVIOUR_HOOKS };
