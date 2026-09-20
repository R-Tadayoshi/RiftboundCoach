"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./fixtures/board.js");

require("../extension/src/exhaust.js");
require("../extension/src/board.js");
require("../extension/src/visibility.js");
const Snapshot = require("../extension/src/snapshot.js");
const { summarize, readyRunes, runeDomain, knownTrash, codesToResolve } = require("../coach/summarize.js");
const { buildUserMessage, SYSTEM, describeRunes } = require("../coach/prompt.js");
const { shouldCoach, SOLO_MODES } = require("../coach/index.js");

const snap = () => {
  fixture.build();
  return Snapshot.build();
};

test("ready runes are counted by domain", () => {
  const r = readyRunes({
    count: 4,
    visible: [
      { name: "Calm Rune", exhausted: false },
      { name: "Calm Rune", exhausted: false },
      { name: "Chaos Rune", exhausted: true },
      { name: "Body Rune", exhausted: false },
    ],
  });
  assert.equal(r.ready, 3);
  assert.equal(r.exhausted, 1);
  assert.deepEqual(r.byDomain, { Calm: 2, Body: 1 });
});

test("an unreadable rune is not counted as ready", () => {
  // Reporting it ready would invent a response the opponent may not have.
  const r = readyRunes({ count: 2, visible: [{ name: "Calm Rune", exhausted: null }, { name: "Calm Rune", exhausted: false }] });
  assert.equal(r.ready, 1);
  assert.equal(r.unknown, 1);
  assert.deepEqual(r.byDomain, { Calm: 1 });
});

test("rune domains come off the card name", () => {
  assert.equal(runeDomain({ name: "Chaos Rune" }), "Chaos");
  assert.equal(runeDomain({ name: "Irelia, Fervent" }), null);
  assert.equal(runeDomain({}), null);
});

test("trash is grouped so copies are countable", () => {
  const t = knownTrash({
    visible: [
      { name: "Defy", code: "OGN-045" },
      { name: "Defy", code: "OGN-045" },
      { name: "Flash", code: "OGS-011" },
    ],
  });
  assert.deepEqual(t[0], { name: "Defy", code: "OGN-045", count: 2 });
  assert.equal(t.length, 2);
});

test("the summary carries their hand count and nothing about its contents", () => {
  const s = summarize(snap());
  assert.equal(typeof s.them.handCount, "number");
  assert.ok(!("hand" in s.them), "no hand list on their side at all");
  assert.match(s.hiddenFromMe.note, /never from specific cards in hand/);
});

test("my own hand is carried in full", () => {
  const s = summarize(snap());
  assert.equal(s.me.hand.length, 2);
  assert.ok(s.me.hand.every((c) => c.name));
});

test("codesToResolve skips tokens, which have no code", () => {
  fixture.build({
    zones: { self: { base: [{ id: "t1", code: null, name: "Gold", exhausted: false }] } },
  });
  const codes = codesToResolve(Snapshot.build());
  assert.ok(!codes.includes(null));
  assert.ok(codes.every((c) => typeof c === "string"));
});

test("the prompt never contains a card from their hand", () => {
  fixture.build({
    mode: "solo_lab",
    opponentId: "plr_x",
    zones: {
      opponent: {
        // Revealed by the client, as Two-Sided Practice does.
        hand: [{ id: "o1", code: "OGN-138", name: "Catalyst of Aeons" }],
      },
    },
  });
  const s = Snapshot.build();
  const msg = buildUserMessage(summarize(s), {});
  assert.ok(!msg.includes("Catalyst of Aeons"), "their hand card is absent");
  assert.ok(!msg.includes("OGN-138"));
  assert.match(msg, /contents NOT VISIBLE/);
});

test("the system prompt forbids reasoning about their hand", () => {
  assert.match(SYSTEM, /CANNOT see the opponent's hand/);
  assert.match(SYSTEM, /Never name, guess at, or reason about specific\s+cards in their hand/);
  assert.match(SYSTEM, /null, it is unknown, not zero/);
});

test("their ready runes are labelled as the response ceiling", () => {
  const msg = buildUserMessage(summarize(snap()), {});
  assert.match(msg, /what they can respond with/);
});

test("describeRunes reports unreadable runes rather than hiding them", () => {
  assert.match(describeRunes({ total: 3, ready: 1, exhausted: 1, unknown: 1, byDomain: { Calm: 1 } }), /unreadable/);
  assert.equal(describeRunes({ total: 0 }), "none");
});

/* The coach refuses the same matches the extractor refuses to capture. */

test("coaches solo practice", () => {
  for (const mode of ["single_player", "solo_lab"]) {
    assert.ok(SOLO_MODES.has(mode), mode);
    assert.equal(
      shouldCoach({ sequence: "1", match: { mode, isMyTurn: true }, connection: { state: "open" } }),
      true,
      mode
    );
  }
});

test("refuses a real match even if a snapshot reaches it", () => {
  assert.equal(
    shouldCoach({ sequence: "2", match: { mode: "multiplayer", isMyTurn: true }, connection: { state: "open" } }),
    false
  );
});

test("holds off while the board may be stale", () => {
  assert.equal(
    shouldCoach({ sequence: "3", match: { mode: "solo_lab", isMyTurn: true }, connection: { state: "closed" } }),
    false
  );
});

test("does not coach on their turn", () => {
  assert.equal(
    shouldCoach({ sequence: "4", match: { mode: "solo_lab", isMyTurn: false }, connection: { state: "open" } }),
    false
  );
});

test("does not coach twice on the same authoritative state", () => {
  const s = { sequence: "9", match: { mode: "solo_lab", isMyTurn: true }, connection: { state: "open" } };
  assert.equal(shouldCoach(s), true);
});

test("cards in hand are listed without an exhaustion state", () => {
  // A card in hand cannot be exhausted, so "state unknown" would read as a
  // gap in the capture rather than a question that does not apply.
  const { describeHand } = require("../coach/prompt.js");
  assert.equal(describeHand([{ name: "Defy" }, { name: "Flash" }]), "Defy, Flash");
  assert.equal(describeHand([]), "empty");

  const msg = buildUserMessage(summarize(snap()), {});
  const handLine = msg.split("\n").find((l) => l.trim().startsWith("hand:"));
  assert.ok(!handLine.includes("state unknown"), handLine);
});

test("board units still report exhaustion, including when unreadable", () => {
  const { describeUnits } = require("../coach/prompt.js");
  assert.equal(describeUnits([{ name: "A", exhausted: true }]), "A (exhausted)");
  assert.equal(describeUnits([{ name: "B", exhausted: null }]), "B (state unknown)");
});

/* Archetype memory: what this champion has actually shown, across matches. */

const archetypes = require("../coach/archetypes.js");

/* The fixture merges an override onto its defaults, so every zone is blanked
 * explicitly here: otherwise the default board's cards are learned too and the
 * assertion is about the fixture rather than the code. */
const EMPTY_ZONES = {
  hand: [], base: [], battlefieldA: [], battlefieldB: [], runeArea: [], trash: [],
};

const vsJayce = (roomCode, oppZones) => {
  fixture.build({
    mode: "solo_lab",
    opponentId: "plr_x",
    roomCode,
    opponentChampion: "Jayce, Brilliant Inventor",
    zones: { opponent: { ...EMPTY_ZONES, ...oppZones } },
  });
  return Snapshot.build();
};

test("records only the opponent's public cards", () => {
  const store = {};
  archetypes.observe(
    vsJayce("AAA", {
      base: [{ id: "b1", code: "OGN-099", name: "Garbage Grabber" }],
      hand: [{ id: "h1", code: "OGN-138", name: "Catalyst of Aeons" }],
    }),
    store
  );
  const serialised = JSON.stringify(store);
  assert.ok(serialised.includes("OGN-099"), "a card on their board is learned");
  assert.ok(!serialised.includes("OGN-138"), "a card in their hand is never learned");
});

test("runes are not recorded — every deck of a domain has them", () => {
  const store = {};
  archetypes.observe(vsJayce("AAA", { runeArea: [{ id: "r", code: "OGN-126", name: "Body Rune" }] }), store);
  const key = Object.keys(store)[0];
  assert.deepEqual(store[key].cards, {});
});

test("a card played twice in one game counts as one game", () => {
  const store = {};
  const snap = vsJayce("AAA", {
    base: [
      { id: "b1", code: "OGN-099", name: "Garbage Grabber" },
      { id: "b2", code: "OGN-099", name: "Garbage Grabber" },
    ],
  });
  archetypes.observe(snap, store);
  archetypes.observe(snap, store); // same match, captured again
  const prior = archetypes.priorFor(snap, store);
  assert.equal(prior.matchesPlayed, 1);
  assert.equal(prior.cards[0].seen, 1);
});

test("frequency builds across matches", () => {
  const store = {};
  archetypes.observe(vsJayce("AAA", { base: [{ id: "b", code: "OGN-099", name: "Garbage Grabber" }] }), store);
  archetypes.observe(vsJayce("BBB", { base: [{ id: "b", code: "OGN-099", name: "Garbage Grabber" }] }), store);
  archetypes.observe(vsJayce("CCC", { base: [{ id: "c", code: "VEN-075", name: "Platewyrm Egg" }] }), store);

  // Three past games. The current one (DDD) is deliberately NOT counted: the
  // loop reads the prior before folding this game in, so a card first seen a
  // moment ago is not handed back as if history had established it.
  const prior = archetypes.priorFor(vsJayce("DDD", {}), store);
  assert.equal(prior.matchesPlayed, 3);
  assert.deepEqual(prior.cards[0], {
    code: "OGN-099",
    name: "Garbage Grabber",
    seen: 2,
    of: 3,
    seeded: false,
    copies: null,
  });
});

test("the current game is not counted into its own prior", () => {
  const store = {};
  const snap = vsJayce("NOW", { base: [{ id: "b", code: "OGN-099", name: "Garbage Grabber" }] });
  assert.equal(archetypes.priorFor(snap, store), null, "nothing known before this game");
  archetypes.observe(snap, store);
  assert.equal(archetypes.priorFor(snap, store).matchesPlayed, 1, "known only afterwards");
});

test("no history means no prior, rather than an empty one", () => {
  // "You have seen nothing" invites reading absence as evidence.
  assert.equal(archetypes.priorFor(vsJayce("ZZZ", {}), {}), null);
});

test("the prior is labelled as a prior, with its sample size", () => {
  const { describePrior } = require("../coach/prompt.js");
  const text = describePrior({
    champion: "Jayce, Brilliant Inventor",
    matchesPlayed: 4,
    cards: [{ code: "OGN-099", name: "Garbage Grabber", seen: 2, of: 4 }],
  });
  assert.match(text, /A prior, not their list/);
  assert.match(text, /seen in 2 of 4/);
  assert.equal(describePrior(null), "", "no prior adds nothing to the prompt");
});

test("the model is told how to weigh a prior, and not to invent cards", () => {
  assert.match(SYSTEM, /treat it as a\s+prior from past games, not as their current list/);
  assert.match(SYSTEM, /never\s+"they have X"/);
  assert.match(SYSTEM, /Never invent a card/);
});

/* Seeding an archetype from a decklist, rather than waiting to face it. */

const seed = require("../coach/seed.js");

test("a decklist is read the way decklists are written", () => {
  const entries = seed.parseList(`
# Jayce control
3 OGN-099
2x Dredge Up
Platewyrm Egg

  4  VEN-075   # trailing comment
`);
  assert.deepEqual(entries, [
    { count: 3, token: "OGN-099" },
    { count: 2, token: "Dredge Up" },
    { count: 1, token: "Platewyrm Egg" },
    { count: 4, token: "VEN-075" },
  ]);
});

test("seeded and observed cards are kept apart in the prior", () => {
  const store = {
    "Jayce, Brilliant Inventor": {
      matches: ["AAA"],
      cards: {
        "OGN-099": { name: "Garbage Grabber", matches: ["AAA"] },
        "VEN-075": { name: "Platewyrm Egg", matches: [], seeded: true, copies: 3 },
      },
    },
  };
  const prior = archetypes.priorFor(vsJayce("NOW", {}), store);

  assert.deepEqual(prior.cards.map((c) => c.name), ["Garbage Grabber"], "observed");
  assert.deepEqual(prior.seeded.map((c) => c.name), ["Platewyrm Egg"], "seeded, never seen");
});

test("a seeded card that then gets played moves to observed", () => {
  const store = {
    "Jayce, Brilliant Inventor": {
      matches: ["AAA"],
      cards: { "VEN-075": { name: "Platewyrm Egg", matches: ["AAA"], seeded: true, copies: 3 } },
    },
  };
  const prior = archetypes.priorFor(vsJayce("NOW", {}), store);
  assert.equal(prior.cards.length, 1, "a sighting outranks the list it came from");
  assert.equal(prior.seeded.length, 0);
});

test("the prompt marks a seeded list as unconfirmed for this opponent", () => {
  const { describePrior } = require("../coach/prompt.js");
  const text = describePrior({
    champion: "Jayce, Brilliant Inventor",
    matchesPlayed: 0,
    cards: [],
    seeded: [{ code: "VEN-075", name: "Platewyrm Egg", copies: 3 }],
  });
  assert.match(text, /TYPICAL JAYCE/);
  assert.match(text, /NOT confirmed for this opponent/);
  assert.match(text, /may be on a different/);
  assert.match(text, /Platewyrm Egg x3/);
});

test("a seeded list is usable before any game has been played", () => {
  const store = {
    "Jayce, Brilliant Inventor": {
      matches: [],
      cards: { "VEN-075": { name: "Platewyrm Egg", matches: [], seeded: true, copies: 3 } },
    },
  };
  const prior = archetypes.priorFor(vsJayce("FIRST", {}), store);
  assert.ok(prior, "no games played, but the list still helps");
  assert.equal(prior.seeded.length, 1);
});

/* Equipment. The board renders gear as a separate card in the unit's zone with
 * nothing tying them together, so the pairing comes out of the match log. */

const { attachments } = require("../coach/summarize.js");

const equipped = (log, oppZones) => {
  fixture.build({ mode: "solo_lab", opponentId: "plr_x", log, zones: { opponent: oppZones } });
  return Snapshot.build();
};

const BOTH_PRESENT = {
  battlefieldB: [
    { id: "u1", code: "SFD-057", name: "Irelia, Fervent", exhausted: true },
    { id: "g1", code: "SFD-051", name: "Guardian Angel", exhausted: false },
  ],
};

test("reads an equip out of the log", () => {
  const s = equipped(
    [{ at: "01:14", actor: "self", text: "Equipped Guardian Angel to Irelia, Fervent." }],
    BOTH_PRESENT
  );
  assert.deepEqual(attachments(s), { "Guardian Angel": "Irelia, Fervent" });
});

test("a stale pairing is dropped once the pair is no longer together", () => {
  // The unit died, or the gear moved. The log line survives; the pairing must not.
  const s = equipped(
    [{ at: "01:14", actor: "self", text: "Equipped Guardian Angel to Irelia, Fervent." }],
    { battlefieldB: [{ id: "g1", code: "SFD-051", name: "Guardian Angel", exhausted: false }] }
  );
  assert.deepEqual(attachments(s), {}, "gear alone is not attached to anything");
});

test("gear moved to another unit takes the later line", () => {
  const s = equipped(
    [
      { at: "01:10", actor: "self", text: "Equipped Guardian Angel to Treasure Hunter." },
      { at: "01:14", actor: "self", text: "Equipped Guardian Angel to Irelia, Fervent." },
    ],
    BOTH_PRESENT
  );
  assert.deepEqual(attachments(s), { "Guardian Angel": "Irelia, Fervent" });
});

test("no equip line means no attachment claimed", () => {
  const s = equipped([{ at: "01:14", actor: "self", text: "Moved Irelia, Fervent to base." }], BOTH_PRESENT);
  assert.deepEqual(attachments(s), {});
});

test("the prompt shows the pairing and says it came from the log", () => {
  const s = equipped(
    [{ at: "01:14", actor: "self", text: "Equipped Guardian Angel to Irelia, Fervent." }],
    BOTH_PRESENT
  );
  const msg = buildUserMessage(summarize(s), {});
  assert.match(msg, /Guardian Angel \(ready, equipped to Irelia, Fervent per the log\)/);
});

/* Decklists in the format Rift Atlas exports, and several builds per champion. */

test("the exported decklist format parses into its sections", () => {
  const d = seed.parseDeck(`
Legend:
1 Jayce, Defender of Tomorrow

Champion:
1 Jayce, Brilliant Inventor

MainDeck:
3 Promising Future
2 Garbage Grabber

Battlefields:
1 Dragon Roost

Runes:
7 Body Rune

Sideboard:
2 Disposal Order
`);
  assert.deepEqual(d.champion, [{ count: 1, token: "Jayce, Brilliant Inventor" }]);
  assert.equal(d.main.length, 2);
  assert.deepEqual(d.battlefields, [{ count: 1, token: "Dragon Roost" }]);
  assert.deepEqual(d.runes, [{ count: 7, token: "Body Rune" }]);
  assert.deepEqual(d.sideboard, [{ count: 2, token: "Disposal Order" }]);
});

test("a list with no headings is still read as a main deck", () => {
  const d = seed.parseDeck("3 OGN-099\n2 Dredge Up\n");
  assert.equal(d.main.length, 2);
  assert.equal(d.champion.length, 0);
});

test("an unrecognised heading keeps its cards rather than dropping them", () => {
  assert.equal(seed.sectionFor("Tokens"), "main");
  assert.equal(seed.sectionFor("MainDeck"), "main");
  assert.equal(seed.sectionFor("  main deck  "), "main");
});

test("alternate printings normalise to one code", () => {
  const { baseCode } = require("../coach/cards.js");
  assert.equal(baseCode("VEN-068a"), "VEN-068", "alt art is the same card");
  assert.equal(baseCode("VEN-068"), "VEN-068");
  assert.equal(baseCode("OGN-004"), "OGN-004");
});

test("builds stay separate and are narrowed by what has been played", () => {
  const store = {
    "Jayce, Brilliant Inventor": {
      matches: [],
      cards: {},
      variants: {
        Control: {
          name: "Control",
          main: { "VEN-056": { name: "Clairvoyance", copies: 3 }, "OGN-134": { name: "Mobilize", copies: 3 } },
          battlefields: {}, sideboard: {}, runes: [],
        },
        Heron: {
          name: "Heron",
          main: { "OGN-134": { name: "Mobilize", copies: 3 } },
          battlefields: {}, sideboard: {}, runes: [],
        },
      },
    },
  };

  const snap = vsJayce("NOW", {
    trash: [
      { id: "t1", code: "VEN-056", name: "Clairvoyance" },
      { id: "t2", code: "OGN-134", name: "Mobilize" },
    ],
  });
  const prior = archetypes.priorFor(snap, store);

  const control = prior.variants.find((v) => v.name === "Control");
  const heron = prior.variants.find((v) => v.name === "Heron");

  assert.deepEqual(control.evidence.matches.sort(), ["Clairvoyance", "Mobilize"]);
  assert.deepEqual(control.evidence.absent, [], "everything played fits Control");
  assert.deepEqual(heron.evidence.absent, ["Clairvoyance"], "Clairvoyance is evidence against Heron");
});

test("a sideboard card is evidence of its own kind, not an absence", () => {
  const store = {
    "Jayce, Brilliant Inventor": {
      matches: [], cards: {},
      variants: {
        Control: {
          name: "Control", main: {}, battlefields: {},
          sideboard: { "VEN-056": { name: "Clairvoyance", copies: 1 } }, runes: [],
        },
      },
    },
  };
  const snap = vsJayce("NOW", { trash: [{ id: "t1", code: "VEN-056", name: "Clairvoyance" }] });
  const build = archetypes.priorFor(snap, store).variants[0];
  assert.deepEqual(build.evidence.sideOnly, ["Clairvoyance"]);
  assert.deepEqual(build.evidence.absent, []);
});

test("the model is told a build is evidence, not a verdict", () => {
  assert.match(SYSTEM, /the opponent is on at most one of\s+them/);
  assert.match(SYSTEM, /evidence against it, not proof/);
  assert.match(SYSTEM, /tech cards\s+and sideboard swaps exist/);
});
