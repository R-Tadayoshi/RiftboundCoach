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
/* Derived from the header rather than remembered, and kept in sync by a test
 * that re-reads `card.h` and fails on anything missing.
 *
 * Handpicking this list has now produced two rounds of false stubs:
 * `applyReplacement` was absent and called Guardian Angel a blank, then
 * `selfCostReduction` was absent and called Plaza Guardian one. Both cards
 * were implemented. A false STUB blocks a sound search, which is the same sin
 * as a false "illegal" in legality.js — so the list is every virtual a card
 * can override, minus the ones that are not behaviour. */
const NOT_BEHAVIOUR = new Set(["def"]);

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
  // Added after each was found missing by a card it wrongly called a stub.
  "canBeChosenByEnemy", "canBeCountered", "flowCost", "grantedPlayOption",
  "selfCostReduction", "entersReadyOnPlay",
  "levelThreshold", "minTurnToScore", "playableAsReactionToAttack",
  "requiresLegion", "requiresLevel", "suppressesTemporaryTriggersHere",
];

/** Every virtual a card can override, read out of the engine's own header. */
function hooksFromHeader(root) {
  const fs2 = require("fs");
  const p2 = require("path");
  const file = p2.join(root || ROOT, "src", "cards", "card.h");
  if (!fs2.existsSync(file)) return null;
  const text = fs2.readFileSync(file, "utf8");
  const names = [...text.matchAll(/virtual\s+[A-Za-z_:<>,\s*&]+?\s+(\w+)\s*\(/g)].map((m) => m[1]);
  return [...new Set(names)].filter((n) => !NOT_BEHAVIOUR.has(n) && !/^~?Card$/.test(n));
}
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
          hasBehaviour: BEHAVIOUR_RE.test(text) || BASE_RE.test(text) ||
                        COVERED_RE.test(text),
          covered: COVERED_RE.test(text),
          partial: PARTIAL_RE.test(text),
        });
      }
    }
  }
  return out;
}

/* A card can be half done: its main effect written, one printed clause not.
 * The gate as first written is binary — a file with any behaviour hook counts
 * as implemented — so a half-done card reads OK and the search trusts it.
 *
 * That is a worse failure than a stub. A stub does nothing and is refused; a
 * half-done card does most of what it says, which is exactly the kind of wrong
 * that survives a sanity check. Brittle Steel is the live example: "Kill a
 * gear" is an afternoon's work and its [Flow] clause needs an engine mechanic
 * that does not exist, so it is tempting to write the first half and move on.
 *
 * So a card may declare itself unfinished, and the gate believes it over its
 * own inference. The engine's existing files already use this wording in
 * comments ("ENGINE GAP", "not implemented"), which this picks up for free. */
/* The marker has to OPEN a comment line, not merely appear in one.
 *
 * The first version matched the phrase anywhere, and immediately mis-flagged
 * Akali, Silent: her file's header explains that she "carried ENGINE GAP
 * notes" — past tense, describing the gap this project closed. Prose about a
 * fixed problem is not a declaration that the card is broken. */
/* The other half of believing the file.
 *
 * Some cards need no hook at all because the engine handles their text
 * centrally — Rek'Sai, Breacher's three clauses are all keyword or cost-path
 * behaviour — and those files say so with a COVERAGE-OK note. Without reading
 * it, the gate sees a file with no behaviour hook and calls a fully working
 * card a stub. Same anchoring rule as PARTIAL: the marker opens a comment
 * line, so prose mentioning one does not count as declaring one. */
const COVERED_RE = /^[ \t]*(?:\/\/+|\/\*+|\*)[ \t]*COVERAGE-OK\b/m;

const PARTIAL_RE =
  /^[ \t]*(?:\/\/+|\/\*+|\*)[ \t]*(?:PARTIAL|ENGINE GAP|NOT IMPLEMENTED|TODO: implement)\b/m;

/** OK | STUB | PARTIAL | ABSENT, with the reason. */
function verdictFor(card, files) {
  if (!card) return { verdict: "ABSENT", why: "no card in the engine" };
  const impl = files.get(card.id);
  if (!impl) return { verdict: "ABSENT", why: `no C++ file for ${card.id}` };

  const text = (card.ability_text || "") + " " + (card.effect_text || "");
  const needs = !!residualText({ description: text });
  if (!needs) return { verdict: "OK", why: "no behaviour needed (vanilla or keywords only)" };
  if (impl.partial) {
    return {
      verdict: "PARTIAL",
      why: `${impl.file} says it is incomplete — a card that does most of what ` +
        `it says is worse to search over than one that does nothing`,
    };
  }
  if (impl.covered) {
    return { verdict: "OK", why: `${impl.file} declares the engine handles it centrally` };
  }
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

/* What a deck needs before its games can be ranked.
 *
 * The bare count — 228 stubs of 984 — is true and not actionable. What
 * decides whether tonight's game can be ranked is the handful of cards in the
 * two decks at the table, and that is usually a much shorter list. */
function reportDeck(file, index, files) {
  const { parseDeckNames } = require("./alpharune.js");
  const rows = parseDeckNames(fs.readFileSync(file, "utf8"));

  const blocking = [];
  for (const { count, name } of rows) {
    const r = resolve(index, { name });
    const v = verdictFor(r.card, files);
    if (v.verdict !== "OK") blocking.push({ count, name, ...v });
  }

  console.log(`${path.basename(file)} — ${rows.length} distinct card(s)\n`);
  if (!blocking.length) {
    console.log("  Every card is implemented. Games with this deck can be ranked.");
    return 0;
  }
  console.log(`  ${blocking.length} card(s) block ranking:`);
  for (const b of blocking) {
    console.log(`    ${String(b.count).padStart(2)}x ${b.name.padEnd(28)} ${b.verdict}`);
  }
  console.log(
    `\n  Until these are implemented the coach still works on this deck — it ` +
      `\n  reads card text directly — but it cannot rank a board they are on.`
  );
  return blocking.length;
}

function main() {
  const index = loadIndex(ROOT);
  const files = scanCardFiles(ROOT);
  if (!files.size) {
    console.error(`No card files under ${ROOT}/src/cards. Set ALPHARUNE_ROOT.`);
    process.exit(2);
  }

  const deckFlag = process.argv.indexOf("--deck");
  if (deckFlag >= 0 && process.argv[deckFlag + 1]) {
    process.exit(reportDeck(process.argv[deckFlag + 1], index, files) ? 1 : 0);
  }

  const counts = { OK: 0, PARTIAL: 0, STUB: 0, ABSENT: 0 };
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
      `the engine plays it as a blank, and a search over it is not trustworthy.\n` +
      `PARTIAL means the file says so itself: most of the card works, which is\n` +
      `harder to notice going wrong than a card that does nothing.`
  );
  if (stubs.length) {
    console.log(`\nFirst few stubs:`);
    for (const c of stubs.slice(0, 10)) {
      console.log(`  ${c.public_code.padEnd(12)} ${c.name}`);
    }
  }
}

if (require.main === module) main();
module.exports = { scanCardFiles, verdictFor, gate, reportDeck, BEHAVIOUR_HOOKS, hooksFromHeader, PARTIAL_RE, COVERED_RE };
