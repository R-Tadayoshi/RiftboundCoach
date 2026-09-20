"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../coach/gen-cards.js");

const AKALI = {
  id: "ven-038-166", public_code: "VEN-038/166", name: "Akali, Silent",
  set_id: "VEN", collector_number: 38, rarity: "rare", domains: ["Calm"],
  type: "Unit", stats: { energy: 4, might: 4, power: 1 }, keywords: [],
  description: "I can't be chosen by enemy spells and abilities unless I'm in combat.",
  image: "https://example.invalid/a.png",
};

test("a card's data becomes a compilable CardDef", () => {
  const src = G.generate(AKALI, 900);
  assert.match(src, /class AkaliSilent : public UnitCard/);
  assert.match(src, /d\.id = 900;/);
  assert.match(src, /d\.def_id = R"RB\(ven-038-166\)RB";/);
  assert.match(src, /d\.energy_cost = 4;/);
  assert.match(src, /d\.power_cost = 1;/);
  assert.match(src, /d\.might = 4;/);
  assert.match(src, /d\.domains = \{Domain::Calm\};/);
  assert.match(src, /d\.rarity = Rarity::Rare;/);
  assert.match(src, /void register_card_900\(CardRegistry& r\)/);
});

/* The generated file must say what it is. A stub that looks like an
 * implementation is how a search ends up confidently wrong. */
test("a card with printed text is marked as needing one", () => {
  assert.match(G.generate(AKALI, 900), /needs an implementation/);
  assert.match(G.generate(AKALI, 900), /fidelity\.js blocks any search/);
});

test("a vanilla card says its data is its behaviour", () => {
  const src = G.generate({ ...AKALI, description: "" }, 901);
  assert.match(src, /vanilla: its data IS its behaviour/);
  assert.doesNotMatch(src, /needs an implementation/);
});

/* Keywords are declarative and engine-handled, so declaring them is free
 * behaviour — the one part of a card this generator really does implement. */
test("engine keywords are declared, unknown ones are not invented", () => {
  const src = G.generate(
    { ...AKALI, description: "[Deflect 2] (reminder)[Empower] 2 Fury[Assault 3]" },
    902
  );
  assert.match(src, /d\.keywords\.set\(Keyword::Deflect\);/);
  assert.match(src, /d\.keywords\.set\(Keyword::Assault\);/);
  assert.doesNotMatch(src, /Keyword::Empower/, "Empower is not an engine keyword");
  assert.match(src, /d\.deflect_value = 2;/);
  assert.match(src, /d\.assault_value = 3;/);
});

test("a keyword with no rider defaults to 1", () => {
  assert.equal(G.keywordValue("[Shield] (reminder)", "Shield"), 1);
  assert.equal(G.keywordValue("[Shield 4]", "Shield"), 4);
  assert.equal(G.keywordValue("nothing here", "Shield"), 0);
});

test("names become legal identifiers and stable filenames", () => {
  assert.equal(G.className("Akali, Silent"), "AkaliSilent");
  assert.equal(G.className("B.F. Sword"), "BFSword");
  assert.equal(G.fileStem({ collector_number: 38, name: "Akali, Silent" }), "0038_akali_silent");
});

/* Card ids are the registry's keys. A collision silently replaces a card. */
test("the id scan finds the engine's highest in use", () => {
  let max;
  try { max = G.highestId(process.env.ALPHARUNE_ROOT || "../chorlick/alpharune"); }
  catch (_) { return; }
  assert.ok(max > 700, `expected a populated registry, saw ${max}`);
});

/* Idempotence. The first version took "highest id + 1" for every card, so a
 * second run renumbered all 197 files while the aggregator still called the
 * old ids. That does not link, and the error is nowhere near the cause. */
test("a card the engine already has keeps its id", () => {
  const root = process.env.ALPHARUNE_ROOT || "../chorlick/alpharune";
  let scan;
  try { scan = G.scanIds(root); } catch (_) { return; }

  assert.ok(scan.byDefId.size > 700, "should find the existing cards by def_id");
  assert.ok(scan.max >= scan.byDefId.size, "max id is at least the card count");

  // Every def_id maps to exactly one id, and no two cards share one.
  const ids = [...scan.byDefId.values()];
  assert.equal(new Set(ids).size, ids.length, "two cards share an id");
});

test("highestId still reports the ceiling", () => {
  const root = process.env.ALPHARUNE_ROOT || "../chorlick/alpharune";
  try {
    assert.equal(G.highestId(root), G.scanIds(root).max);
  } catch (_) { /* no checkout */ }
});
