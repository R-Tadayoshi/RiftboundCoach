"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../coach/legality.js");

/* A board shaped like the one that produced the illegal advice: both
 * battlefields empty on my side, one exhausted unit, nothing controlled. */
const board = (over = {}) => ({
  battlefields: {
    A: { name: "Targon's Peak", mine: [], theirs: [], ...(over.A || {}) },
    B: { name: "Dragon Roost", mine: [], theirs: [], ...(over.B || {}) },
  },
  me: { base: over.base || [], hand: over.hand || [] },
});

const unit = (name, exhausted = false, text = "") => ({ name, exhausted, text });

/* Card text as the live path supplies it: every visible and playable card is
 * resolved from RiftScribe, so type is present. */
const CARDS = {
  "SFD-100": { name: "Tideturner", type: "Unit", might: 2, text: "" },
  "OGN-043": { name: "Charm", type: "Spell", text: "Move an enemy unit." },
  "SFD-057": {
    name: "Irelia, Fervent",
    type: "Unit",
    might: 4,
    text: "[Deflect] (Opponents must pay rainbow to choose me with a spell or ability.)",
  },
  "VEN-038": {
    name: "Akali, Silent",
    type: "Unit",
    might: 4,
    text:
      "I can't be chosen by enemy spells and abilities unless I'm in combat." +
      "When I move to a battlefield, give me +2 might this turn.",
  },
};

test("the ACTIONS block is parsed, prose is not", () => {
  const actions = L.parseActions(`
Play Tideturner somewhere clever, and move things around.

ACTIONS:
- play Tideturner to base
- move Treasure Hunter from base to battlefield A
- pass
`);
  assert.equal(actions.length, 3);
  assert.deepEqual(
    { verb: actions[0].verb, card: actions[0].card, to: actions[0].to },
    { verb: "play", card: "Tideturner", to: "base" }
  );
  assert.deepEqual(
    { card: actions[1].card, from: actions[1].from, to: actions[1].to },
    { card: "Treasure Hunter", from: "base", to: "battlefield A" }
  );
  assert.equal(actions[2].verb, "pass");
});

/* The regression this guards: ^\s* let \s eat the newline before the header,
 * so parsing began a line early, saw "ACTIONS:" as the start of a new block
 * and stopped — returning nothing at all. A checker that parses nothing
 * approves everything, and does it quietly. */
test("the header is found however it is spaced and padded", () => {
  const shapes = [
    "prose\n\nACTIONS:\n- pass\n",
    "prose\nACTIONS:\n- pass\n",
    "prose\n\n\n  ACTIONS:  \n- pass\n",
    "ACTIONS:\n- pass\n",
    "prose\r\n\r\nACTIONS:\r\n- pass\r\n",
  ];
  for (const text of shapes) {
    assert.equal(
      L.parseActions(text).length,
      1,
      `no actions parsed from ${JSON.stringify(text)}`
    );
  }
});

test("a block after the actions ends the list, and is not read as one", () => {
  const actions = L.parseActions(
    "ACTIONS:\n- play Tideturner to base\n\nNOTES:\n- play around Defy\n"
  );
  assert.equal(actions.length, 1);
  assert.equal(actions[0].card, "Tideturner");
});

test("an answer with no ACTIONS block yields nothing to check", () => {
  assert.deepEqual(L.parseActions("Just some prose about the board."), []);
  assert.deepEqual(L.check("Just some prose.", board(), {}), []);
});

test("battlefields resolve by letter or by name", () => {
  const b = board();
  assert.equal(L.resolveBattlefield("battlefield A", b), "A");
  assert.equal(L.resolveBattlefield("B", b), "B");
  assert.equal(L.resolveBattlefield("Targon's Peak", b), "A");
  assert.equal(L.resolveBattlefield("Dragon Roost", b), "B");
  assert.equal(L.resolveBattlefield("somewhere", b), null);
});

/* The failure that started this: playing a unit onto a battlefield with no
 * units of yours on it. All three models did it, at three efforts. */

test("playing onto a battlefield you do not control is rejected", () => {
  const v = L.check("ACTIONS:\n- play Tideturner to battlefield A", board(), CARDS);
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, "355.2.a");
  assert.match(v[0].why, /you have no units there/);
});

test("playing to your base is always fine", () => {
  assert.deepEqual(L.check("ACTIONS:\n- play Tideturner to base", board(), CARDS), []);
});

test("playing onto a battlefield you hold is fine", () => {
  const b = board({ A: { mine: [unit("Treasure Hunter")] } });
  assert.deepEqual(L.check("ACTIONS:\n- play Tideturner to battlefield A", b, CARDS), []);
});

test("a card with Ambush is never flagged — its text grants the permission", () => {
  const cardText = {
    "SFD-001": { name: "Sneaky", text: "[Ambush] (I may be played to a battlefield where you control Units.)" },
  };
  assert.deepEqual(
    L.check("ACTIONS:\n- play Sneaky to battlefield A", board(), cardText),
    [],
    "the checker must not overrule a card"
  );
});

/* Moving. */

test("an exhausted unit cannot move", () => {
  const b = board({ base: [unit("Tideturner", true)] });
  const v = L.check("ACTIONS:\n- move Tideturner to battlefield A", b, {});
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, "144.2");
  assert.match(v[0].why, /moving costs exhausting the unit, and it already is/);
});

test("a ready unit moving base to battlefield is fine", () => {
  const b = board({ base: [unit("Tideturner", false)] });
  assert.deepEqual(L.check("ACTIONS:\n- move Tideturner to battlefield A", b, {}), []);
});

test("battlefield to battlefield needs Ganking", () => {
  const b = board({ A: { mine: [unit("Tideturner", false)] } });
  const v = L.check("ACTIONS:\n- move Tideturner from battlefield A to battlefield B", b, {});
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, "144.4.c.1");
  assert.match(v[0].why, /needs\s+Ganking/);
});

test("a unit with Ganking may cross between battlefields", () => {
  const b = board({ A: { mine: [unit("Roamer", false, "[Ganking] I may move to a battlefield from another battlefield.")] } });
  assert.deepEqual(
    L.check("ACTIONS:\n- move Roamer from battlefield A to battlefield B", b, {}),
    []
  );
});

test("returning to base from a battlefield is fine", () => {
  const b = board({ A: { mine: [unit("Tideturner", false)] } });
  assert.deepEqual(L.check("ACTIONS:\n- move Tideturner from battlefield A to base", b, {}), []);
});

/* Hiding. */

test("Hide with no controlled battlefield is rejected", () => {
  const v = L.check("ACTIONS:\n- hide Tideturner", board(), {});
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, "811.1.b");
});

test("Hide is fine once you hold a battlefield", () => {
  const b = board({ B: { mine: [unit("Treasure Hunter")] } });
  assert.deepEqual(L.check("ACTIONS:\n- hide Tideturner", b, {}), []);
});

/* The governing rule of this file: never flag something that might be legal. */

test("an unknown unit is not judged", () => {
  assert.deepEqual(L.check("ACTIONS:\n- move Someone Else to base", board(), {}), []);
});

test("an unrecognised destination is not judged", () => {
  assert.deepEqual(L.check("ACTIONS:\n- play Tideturner to the moon", board(), CARDS), []);
});

test("a contested battlefield where I have units is not flagged", () => {
  // Control may or may not be mine, so the checker stays quiet.
  const b = board({ A: { mine: [unit("Mine")], theirs: [unit("Theirs")] } });
  assert.deepEqual(L.check("ACTIONS:\n- play Tideturner to battlefield A", b, CARDS), []);
});

/* Turn 9, Zarkhil 3 — 5. The coach proposed Charm on Akali, Silent and wrote
 * "Akali's 'can't be chosen unless in combat' clause doesn't stop Charm since
 * you're targeting it outside combat" — the condition read backwards. The
 * action was legal in shape, so the checker passed it. */

const mainPhase = (over = {}) => ({ ...board(over), turn: { step: "main" } });

test("a unit that cannot be chosen outside combat is not a legal target", () => {
  const b = mainPhase({ B: { theirs: [unit("Akali, Silent")] } });
  const v = L.check(
    "ACTIONS:\n- play Charm targeting Akali, Silent",
    b,
    CARDS
  );
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, "355.9.b");
  assert.match(v[0].why, /OUTSIDE combat/);
});

test("the same target is left alone when the step is not plainly the main phase", () => {
  const b = { ...board({ B: { theirs: [unit("Akali, Silent")] } }), turn: { step: "showdown" } };
  assert.deepEqual(L.check("ACTIONS:\n- play Charm targeting Akali, Silent", b, CARDS), []);
});

test("Deflect is a cost, not a prohibition, so it is never flagged", () => {
  const b = mainPhase({ B: { theirs: [unit("Irelia, Fervent")] } });
  assert.deepEqual(
    L.check("ACTIONS:\n- play Charm targeting Irelia, Fervent", b, CARDS),
    [],
    "paying rainbow makes the choice legal"
  );
});

test("an unnamed target cannot be judged", () => {
  const b = mainPhase({ B: { theirs: [unit("Akali, Silent")] } });
  assert.deepEqual(L.check("ACTIONS:\n- play Charm to base", b, CARDS), []);
});

/* The false positive this run produced: Charm is a Spell, and 355.2 governs
 * where UNITS enter. A spell written with a destination is loose phrasing. */
test("a spell named with a destination is not an illegal placement", () => {
  assert.deepEqual(
    L.check("ACTIONS:\n- play Charm to battlefield A", board(), CARDS),
    [],
    "355.2 is about units; a spell is not played to a location"
  );
});

test("the targeting clause does not leak into the card or destination", () => {
  const [a] = L.parseActions("ACTIONS:\n- play Charm targeting Akali, Silent");
  assert.equal(a.card, "Charm");
  assert.equal(a.target, "Akali, Silent");
  assert.equal(a.to, null);

  const [m] = L.parseActions("ACTIONS:\n- move Tideturner from base to battlefield B");
  assert.equal(m.card, "Tideturner");
  assert.equal(m.to, "battlefield B");
  assert.equal(m.target, null);
});

/* Turn 11, Zarkhil 5 — 6, eleven ready runes. One answer proposed Draven
 * (6 Energy + 1 Power) and Stellacorn Herder (4 Energy) — 11 runes, every one
 * spent — while advising "hold En Garde/Defy up in case they draw into a
 * trick". The other called Draven "exactly 6 of your 11", losing the Power. */

const COSTS = {
  "SFD-148": { name: "Draven, Audacious", type: "Unit", energy: 6, power: 1, might: 6, text: "" },
  "SFD-048": { name: "Stellacorn Herder", type: "Unit", energy: 4, power: null, might: 3, text: "" },
  "OGN-046": { name: "En Garde", type: "Spell", energy: 1, power: null, text: "" },
  "MYST-001": { name: "Mystery", type: "Unit", might: 2, text: "" },
};

const withRunes = (ready, unknown = 0) => ({
  ...board(),
  turn: { step: "main" },
  me: { base: [], hand: [], runes: { total: ready, ready, exhausted: 0, unknown, byDomain: {} } },
});

test("a line that costs more than the ready runes is rejected", () => {
  const v = L.check(
    "ACTIONS:\n- play Draven, Audacious to base\n- play Stellacorn Herder to base",
    withRunes(10),
    COSTS
  );
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, "164.2");
  assert.match(v[0].why, /costs 11 but you have 10/);
});

test("Power is counted as its own rune, not folded into the Energy", () => {
  // Draven alone is 7 runes, not 6 — the mistake in the answer.
  assert.equal(L.check("ACTIONS:\n- play Draven, Audacious to base", withRunes(6), COSTS).length, 1);
  assert.deepEqual(L.check("ACTIONS:\n- play Draven, Audacious to base", withRunes(7), COSTS), []);
});

test("spending every rune is legal, and not flagged", () => {
  // Tapping out is a judgement call, not a rules violation.
  assert.deepEqual(
    L.check(
      "ACTIONS:\n- play Draven, Audacious to base\n- play Stellacorn Herder to base",
      withRunes(11),
      COSTS
    ),
    []
  );
});

test("one unknown cost silences the sum rather than guessing at it", () => {
  assert.deepEqual(
    L.check(
      "ACTIONS:\n- play Draven, Audacious to base\n- play Mystery to base",
      withRunes(1),
      COSTS
    ),
    [],
    "a partial total is not evidence of anything"
  );
});

test("runes the board could not read are assumed available", () => {
  assert.deepEqual(
    L.check("ACTIONS:\n- play Draven, Audacious to base", withRunes(5, 2), COSTS),
    [],
    "never flag on the strength of an unreadable rune"
  );
});

test("moving costs no runes, so a move never counts toward the total", () => {
  const b = {
    ...withRunes(0),
    me: { base: [unit("Tideturner")], hand: [], runes: { total: 0, ready: 0, exhausted: 3, unknown: 0, byDomain: {} } },
  };
  assert.deepEqual(L.check("ACTIONS:\n- move Tideturner to battlefield A\n- pass", b, COSTS), []);
});
