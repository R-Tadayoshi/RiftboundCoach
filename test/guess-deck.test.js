"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../coach/guess-deck.js");

/* Scoring. A card they played that a build does NOT contain is strong
 * evidence against it; a card it does contain is weaker evidence for, since
 * staples are in everything. */
test("a card seen that the build lacks counts against it, hard", () => {
  const fits = G.scoreBuild({ evidence: { matches: ["a", "b", "c"], sideOnly: [], absent: [] } });
  const contradicted = G.scoreBuild({ evidence: { matches: ["a", "b", "c"], sideOnly: [], absent: ["x"] } });
  assert.ok(contradicted.score < fits.score);
  assert.equal(fits.score - contradicted.score, 2, "an absent card outweighs a match");
});

test("sideboard hits count for little", () => {
  const main = G.scoreBuild({ evidence: { matches: ["a"], sideOnly: [], absent: [] } });
  const side = G.scoreBuild({ evidence: { matches: [], sideOnly: ["a"], absent: [] } });
  assert.ok(side.score < main.score);
});

/* The refusals matter more than the picks: their unseen hand is sampled from
 * whatever list we supply, so a wrong list makes the ranking average over
 * cards they are not holding. */
test("nothing seeded means no guess", () => {
  const r = G.guess({});
  assert.equal(r.ok, false);
  assert.match(r.why, /nothing seeded/);
});

test("too little evidence is a refusal, not a default", () => {
  const snapshot = {};
  const archetypes = require("../coach/archetypes.js");
  const realPrior = archetypes.priorFor;
  const realVariants = archetypes.variantsFor;
  archetypes.priorFor = () => ({ entry: {}, champion: "Someone" });
  archetypes.variantsFor = () => [
    { name: "Only Build", cards: [], battlefields: [], runes: [], sideboard: [],
      evidence: { matches: ["a"], sideOnly: [], absent: [] } },
  ];
  try {
    const r = G.guess(snapshot);
    assert.equal(r.ok, false);
    assert.match(r.why, /shares only 1 card/);
    assert.match(r.why, /worse than not ranking/);
  } finally {
    archetypes.priorFor = realPrior;
    archetypes.variantsFor = realVariants;
  }
});

test("two builds fitting equally well is a refusal, not a coin flip", () => {
  const archetypes = require("../coach/archetypes.js");
  const realPrior = archetypes.priorFor;
  const realVariants = archetypes.variantsFor;
  const ev = { matches: ["a", "b", "c", "d"], sideOnly: [], absent: [] };
  archetypes.priorFor = () => ({ entry: {}, champion: "Someone" });
  archetypes.variantsFor = () => [
    { name: "Build A", cards: [], battlefields: [], runes: [], sideboard: [], evidence: ev },
    { name: "Build B", cards: [], battlefields: [], runes: [], sideboard: [], evidence: ev },
  ];
  try {
    const r = G.guess({});
    assert.equal(r.ok, false);
    assert.match(r.why, /fit the evidence equally well/);
  } finally {
    archetypes.priorFor = realPrior;
    archetypes.variantsFor = realVariants;
  }
});

test("a clearly-best build is chosen", () => {
  const archetypes = require("../coach/archetypes.js");
  const realPrior = archetypes.priorFor;
  const realVariants = archetypes.variantsFor;
  archetypes.priorFor = () => ({ entry: {}, champion: "Someone" });
  archetypes.variantsFor = () => [
    { name: "Fits", cards: [], battlefields: [], runes: [], sideboard: [],
      evidence: { matches: ["a", "b", "c", "d"], sideOnly: [], absent: [] } },
    { name: "Contradicted", cards: [], battlefields: [], runes: [], sideboard: [],
      evidence: { matches: ["a", "b", "c"], sideOnly: [], absent: ["x", "y"] } },
  ];
  try {
    const r = G.guess({});
    assert.equal(r.ok, true);
    assert.equal(r.build.name, "Fits");
  } finally {
    archetypes.priorFor = realPrior;
    archetypes.variantsFor = realVariants;
  }
});

/* The file has to load in the engine, which means engine names. */
test("a decklist is written in the format the engine reads", () => {
  let index;
  try { index = require("../coach/alpharune.js").loadIndex(); } catch (_) { return; }
  const { text, unknown } = G.toDeckFile(
    {
      legend: "Fiora, Grand Duelist",
      cards: [{ name: "Challenge", copies: 3 }],
      battlefields: [],
      sideboard: [],
    },
    { index }
  );
  assert.deepEqual(unknown, []);
  assert.match(text, /^Legend:$/m);
  assert.match(text, /^1 Grand Duelist$/m, "the champion tag must be stripped");
  assert.match(text, /^MainDeck:$/m);
  assert.match(text, /^3 Challenge$/m);
});
