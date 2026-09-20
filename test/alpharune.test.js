"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const A = require("../coach/alpharune.js");

/* These tests need the engine checkout. Without it they say so and skip,
 * rather than passing quietly — an unverified mapping is not a working one. */
let index = null;
try {
  index = A.loadIndex();
} catch (err) {
  console.warn(`  (alpharune tests skipped: ${err.message.split(".")[0]})`);
}
const withIndex = (fn) => () => (index ? fn() : undefined);

test("codes reduce to a set-and-number key whatever the spelling", () => {
  assert.equal(A.baseCode("SFD-057/221"), "SFD-057");
  assert.equal(A.baseCode("sfd-057-221"), "SFD-057");
  assert.equal(A.baseCode("SFD-57"), "SFD-057");
  assert.equal(A.baseCode(null), null);
});

/* RiftAtlas prints a legend as "<champion tag>, <card name>"; the card is
 * named by the second half alone. No legend in the index has a comma. */
test("a champion tag in front of a legend name is an alternative, not the name", () => {
  assert.deepEqual(A.nameVariants("Irelia, Blade Dancer"), [
    "irelia, blade dancer",
    "blade dancer",
  ]);
  assert.deepEqual(A.nameVariants("Blade Dancer"), ["blade dancer"]);
});

test(
  "the legend on the board resolves to the engine's card",
  withIndex(() => {
    const r = A.resolve(index, { name: "Irelia, Blade Dancer" });
    assert.ok(!r.miss, r.why);
    assert.equal(r.card.name, "Blade Dancer");
    assert.match(r.how, /champion tag stripped/);
  })
);

test(
  "a public code resolves even when the printing differs",
  withIndex(() => {
    // RiftScribe serves Blade Dancer as SFD-195; the index has only SFD-246.
    const byName = A.resolve(index, { code: "SFD-195/221", name: "Blade Dancer" });
    assert.ok(!byName.miss);
    assert.equal(byName.card.public_code, "SFD-246/221");
    assert.match(byName.how, /code absent/);
  })
);

test(
  "reprints under one name are only accepted when they play the same",
  withIndex(() => {
    const r = A.resolve(index, { name: "Lonely Poro" });
    assert.ok(!r.miss, r.why);
    assert.match(r.how, /identical printings/);
  })
);

test(
  "the engine's own deck files map completely",
  withIndex(() => {
    const deck = "/home/user/chorlick/alpharune/decks/draven_test.txt";
    if (!fs.existsSync(deck)) return;
    const r = A.checkDeck(deck, index);
    assert.deepEqual(r.misses, [], "a deck the engine ships should resolve");
  })
);

test(
  "VEN is absent, and that is reported rather than discovered later",
  withIndex(() => {
    const sets = A.coveredSets(index);
    assert.equal(sets.VEN, undefined, "if VEN appears, this limitation is gone");
    for (const s of ["OGN", "SFD", "UNL"]) assert.ok(sets[s] > 0, `${s} missing`);
    // A VEN card the opponent actually played.
    const r = A.resolve(index, { code: "VEN-038/166", name: "Akali, Silent" });
    assert.ok(r.miss, "Akali, Silent should not resolve");
  })
);

/* Importing a set. The classifier decides how much of a set the engine gets
 * for nothing, so it has to be honest in the conservative direction: a card
 * counted as "free" that actually needs code becomes a stub, and a stub makes
 * the search wrong while still returning a number. */
const F = require("../coach/fetch-set.js");

test("a card with no text at all needs nothing", () => {
  assert.equal(F.classify({ description: "" }), "vanilla");
  assert.equal(F.classify({}), "vanilla");
});

test("a card whose text is only keyword reminders needs nothing", () => {
  assert.equal(
    F.classify({
      description: "[Deflect] (Opponents must pay :rb_rune_rainbow: to choose me with a spell or ability.)",
    }),
    "keywords-only"
  );
});

test("real rules text is never counted as free", () => {
  assert.equal(
    F.classify({
      description:
        "[Deflect] (Opponents must pay :rb_rune_rainbow: to choose me.)When you choose or ready me, give me +1 :rb_might: this turn.",
    }),
    "needs-behaviour"
  );
  assert.equal(F.classify({ description: "Move an enemy unit." }), "needs-behaviour");
  assert.equal(
    F.classify({ description: "I can't be chosen by enemy spells and abilities unless I'm in combat." }),
    "needs-behaviour"
  );
});

test("the residual is the text an implementation would have to cover", () => {
  assert.equal(F.residualText({ description: "Kill a gear." }), "Kill a gear.");
  assert.equal(F.residualText({ description: "[Temporary] (Kill me at the start of your Beginning Phase.)" }), "");
});

/* The fidelity gate. A stub card is worse than a missing one for a search:
 * the engine plays it as a blank and the search returns a confident number
 * about a board that is quietly wrong. */
const Fid = require("../coach/fidelity.js");

test(
  "cards whose text needs behaviour, with a file that has none, are stubs",
  withIndex(() => {
    const files = Fid.scanCardFiles();
    if (!files.size) return;

    const card = { id: "x-1", ability_text: "Kill a gear." };
    assert.equal(
      Fid.verdictFor(card, new Map([["x-1", { file: "f.cpp", hasBehaviour: false }]])).verdict,
      "STUB"
    );
    assert.equal(
      Fid.verdictFor(card, new Map([["x-1", { file: "f.cpp", hasBehaviour: true }]])).verdict,
      "OK"
    );
  })
);

test("a card needing no behaviour is fine with no behaviour", () => {
  const vanilla = { id: "x-2", ability_text: "" };
  const kw = { id: "x-3", ability_text: "[Temporary] (Kill me at the start of your Beginning Phase.)" };
  const files = new Map([
    ["x-2", { file: "a.cpp", hasBehaviour: false }],
    ["x-3", { file: "b.cpp", hasBehaviour: false }],
  ]);
  assert.equal(Fid.verdictFor(vanilla, files).verdict, "OK");
  assert.equal(Fid.verdictFor(kw, files).verdict, "OK");
});

test("a card the engine does not have at all is ABSENT, not OK", () => {
  assert.equal(Fid.verdictFor(null, new Map()).verdict, "ABSENT");
  assert.equal(
    Fid.verdictFor({ id: "nope", ability_text: "x" }, new Map()).verdict,
    "ABSENT"
  );
});

test(
  "the gate refuses a position containing a VEN card",
  withIndex(() => {
    if (!Fid.scanCardFiles().size) return;
    const r = Fid.gate([
      { code: "SFD-148", name: "Draven, Audacious" },
      { code: "VEN-038", name: "Akali, Silent" },
    ]);
    assert.equal(r.safe, false);
    assert.equal(r.blocking.length, 1);
    assert.equal(r.blocking[0].verdict, "ABSENT");
  })
);

test(
  "a position of fully implemented cards passes",
  withIndex(() => {
    if (!Fid.scanCardFiles().size) return;
    const r = Fid.gate([
      { code: "SFD-148", name: "Draven, Audacious" },
      { name: "Irelia, Blade Dancer" },
      { code: "OGN-046", name: "En Garde" },
    ]);
    assert.equal(r.safe, true, JSON.stringify(r.blocking));
  })
);
