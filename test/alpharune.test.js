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

/* VEN was absent from the engine entirely until coach/gen-cards.js imported
 * it. The cards are there now as data-only stubs, so they RESOLVE — and the
 * fidelity gate is what stops a search over them, not the index. */
test(
  "the four original sets are covered, and an imported one resolves",
  withIndex(() => {
    const sets = A.coveredSets(index);
    for (const s of ["OGN", "SFD", "UNL"]) assert.ok(sets[s] > 0, `${s} missing`);

    const r = A.resolve(index, { code: "VEN-038/166", name: "Akali, Silent" });
    if (sets.VEN) {
      assert.ok(!r.miss, "an imported VEN card should resolve by code");
      assert.equal(r.card.name, "Akali, Silent");
    } else {
      assert.ok(r.miss, "without the import VEN cannot resolve");
    }
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

/* The gate must refuse a board holding an unimplemented card, whichever card
 * that happens to be. Naming one makes the test a liability: it pinned Akali,
 * Silent, and broke the day she was implemented — reporting a regression where
 * there was progress. So the stub is found, not assumed. */
function anyStub(index, files) {
  for (const card of index.rows) {
    if (Fid.verdictFor(card, files).verdict === "STUB") return card;
  }
  return null;
}

test(
  "the gate refuses a position containing an unimplemented card",
  withIndex(() => {
    const files = Fid.scanCardFiles();
    if (!files.size) return;
    const stub = anyStub(index, files);
    if (!stub) return; // every card implemented — nothing to refuse

    const r = Fid.gate([
      { code: "SFD-148", name: "Draven, Audacious" },
      { code: stub.public_code, name: stub.name },
    ]);
    assert.equal(r.safe, false, `expected ${stub.name} to block`);
    assert.ok(r.blocking.some((b) => ["ABSENT", "STUB"].includes(b.verdict)));
  })
);

/* The card that started this: Akali, Silent, played against Zarkhil on turn 9.
 * Absent from the engine, then a generated stub, now implemented — her first
 * clause needed a board-aware canBeChosenByEnemy, which the engine gained. */
test(
  "Akali, Silent no longer blocks a ranking",
  withIndex(() => {
    const files = Fid.scanCardFiles();
    if (!files.size) return;
    const r = A.resolve(index, { code: "VEN-038", name: "Akali, Silent" });
    if (r.miss) return; // set not imported in this checkout
    assert.equal(Fid.verdictFor(r.card, files).verdict, "OK");
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

/* Keyword scanning. I ran this by hand against the set INDEX — whose records
 * carry no description — and reported "VEN introduces no new keywords" from
 * 197 empty strings. Empowered is on 59 of them. The tool now refuses that
 * input instead of answering it. */

test("a keyword scan over textless records is refused, not answered", () => {
  const index = [{ name: "A", description: "" }, { name: "B" }];
  assert.throws(() => F.newKeywords(index), /not the full records/);
});

test("keywords are split by whether the engine has an enum value", () => {
  const engine = new Set(["deflect", "assault"]);
  const r = F.newKeywords(
    [
      { description: "[Deflect] (reminder)[Empower] :rb_energy_2:" },
      { description: "[Empowered][>] I have [Assault 3]." },
    ],
    engine
  );
  assert.deepEqual(r.known.map((k) => k.keyword).sort(), ["assault", "deflect"]);
  assert.deepEqual(r.unknown.map((k) => k.keyword).sort(), ["empower", "empowered"]);
});

test(
  "the engine's keyword list is read from its source, not copied",
  withIndex(() => {
    const e = F.engineKeywords();
    if (!e) return;
    assert.equal(e.size, 23);
    assert.ok(e.has("deflect") && e.has("ganking") && e.has("temporary"));
    assert.ok(!e.has("empower"), "if this fails the engine has gained Empower");
  })
);

test(
  "VEN's new mechanics are reported, Empowered among them",
  withIndex(() => {
    const fs2 = require("fs");
    if (!fs2.existsSync("state/sets/ven.json")) return;
    const cards = Object.values(JSON.parse(fs2.readFileSync("state/sets/ven.json", "utf8")));
    const r = F.newKeywords(cards, F.engineKeywords());
    const names = r.unknown.map((k) => k.keyword);
    for (const k of ["empowered", "empower", "flow"]) {
      assert.ok(names.includes(k), `${k} should be reported as new`);
    }
  })
);

/* A reprint is the commonest thing in a card game and the comparison has to
 * survive one. The engine's index writes null for an absent cost; the
 * importer wrote 0, so "Irelia, Fervent" — SFD-057, reprinted as VEN-174 —
 * compared as two different cards and her name became an ambiguity error. */
test("null and 0 are the same cost when comparing printings", () => {
  const a = { energy_cost: 5, power_cost: null, might: 4, card_type: "unit" };
  const b = { energy_cost: 5, power_cost: 0, might: 4, card_type: "unit" };
  assert.equal(A.sameCard(a, b), true);
  assert.equal(A.sameCard(a, { ...b, energy_cost: 6 }), false);
});

test(
  "a card reprinted in a later set still resolves by name",
  withIndex(() => {
    for (const name of ["Irelia, Fervent", "Lonely Poro"]) {
      const r = A.resolve(index, { name });
      assert.ok(!r.miss, `${name}: ${r.why}`);
      assert.match(r.how, /printings|name/);
    }
  })
);

/* The fidelity gate's false positives. The hook list originally came from the
 * engine's own audit script and covered only on(Resolve|Trigger|Activate|...).
 * That missed applyReplacement, so Guardian Angel — whose replacement effect
 * is implemented in full, and which sits in the deck this project was built
 * around — was called a stub. A false STUB blocks a search that would have
 * been sound: the same sin as a false "illegal" in legality.js. */
test(
  "a card implemented through a replacement effect is not a stub",
  withIndex(() => {
    const files = Fid.scanCardFiles();
    if (!files.size) return;
    const r = A.resolve(index, { code: "SFD-051", name: "Guardian Angel" });
    assert.ok(!r.miss);
    const v = Fid.verdictFor(r.card, files);
    assert.equal(v.verdict, "OK", v.why);
  })
);

test("the hook list covers the engine's non-obvious behaviour points", () => {
  for (const hook of ["applyReplacement", "applyPassiveAura", "equippedKeywords",
                      "alternativePlayCost", "optionalAdditionalCost"]) {
    assert.ok(Fid.BEHAVIOUR_HOOKS.includes(hook), `${hook} missing from the hook list`);
  }
});

test(
  "a card inheriting a behaviour base counts as implemented",
  withIndex(() => {
    const files = Fid.scanCardFiles();
    if (!files.size) return;
    // SimpleEquipGear and friends carry the keyword's mechanics for the card.
    const withBase = [...files.values()].filter((f) => f.hasBehaviour).length;
    assert.ok(withBase > 600, `expected most cards to carry behaviour, saw ${withBase}`);
  })
);

/* "228 of 984 cards are stubs" is true and useless. What decides whether
 * tonight's game can be ranked is the few cards in the two decks at the
 * table, which is usually a much shorter list. */
test(
  "a deck report names only the cards that block ranking IT",
  withIndex(() => {
    const files = Fid.scanCardFiles();
    const fs2 = require("fs");
    const deck = "/home/user/chorlick/alpharune/decks/draven_test.txt";
    if (!files.size || !fs2.existsSync(deck)) return;

    const logs = [];
    const realLog = console.log;
    console.log = (...a) => logs.push(a.join(" "));
    let blocking;
    try { blocking = Fid.reportDeck(deck, index, files); }
    finally { console.log = realLog; }

    const out = logs.join("\n");
    assert.match(out, /distinct card\(s\)/);
    if (blocking) {
      assert.match(out, /block ranking/);
      // The deck has ~29 distinct cards; whatever blocks must be fewer.
      assert.ok(blocking < 29, "a whole-deck block would not be a useful report");
      assert.match(out, /the coach still works on this deck/);
    } else {
      assert.match(out, /Every card is implemented/);
    }
  })
);

/* Half-done cards. The gate was binary — any behaviour hook meant implemented
 * — so a card with its main effect written and one clause missing read OK and
 * the search trusted it. That is worse than a stub: a stub does nothing and is
 * refused, while a half-done card does most of what it says, which is the kind
 * of wrong that survives a sanity check. */
test("a file that declares itself incomplete is not counted as implemented", () => {
  const files = new Map([
    ["x-1", { file: "a.cpp", hasBehaviour: true, partial: true }],
    ["x-2", { file: "b.cpp", hasBehaviour: true, partial: false }],
  ]);
  const card = (id) => ({ id, ability_text: "Kill a gear." });
  assert.equal(Fid.verdictFor(card("x-1"), files).verdict, "PARTIAL");
  assert.equal(Fid.verdictFor(card("x-2"), files).verdict, "OK");
});

test("a declaration is picked up; a mention of one is not", () => {
  assert.match("    // ENGINE GAP: cannot be expressed", Fid.PARTIAL_RE);
  assert.match("/// PARTIAL: the second clause is missing", Fid.PARTIAL_RE);
  assert.match(" * TODO: implement the Flow clause", Fid.PARTIAL_RE);

  // Prose about a gap that was closed is not a declaration that one remains.
  assert.doesNotMatch(
    "/// this card, and Master Yi, carried ENGINE GAP notes. The\n/// overload fixed it.",
    Fid.PARTIAL_RE
  );
  assert.doesNotMatch("// implemented in full", Fid.PARTIAL_RE);
});

test(
  "a PARTIAL card blocks a ranking just as a stub does",
  withIndex(() => {
    const files = Fid.scanCardFiles();
    if (!files.size) return;
    const partial = index.rows.find((c) => Fid.verdictFor(c, files).verdict === "PARTIAL");
    if (!partial) return;
    const r = Fid.gate([{ code: partial.public_code, name: partial.name }]);
    assert.equal(r.safe, false, `${partial.name} should block`);
  })
);
