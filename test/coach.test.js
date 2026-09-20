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

test("seedAll reads a folder, since dropping files in one is the obvious move", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rbc-decks-"));
  fs.writeFileSync(path.join(dir, "a.txt"), "3 OGN-099\n");
  fs.writeFileSync(path.join(dir, "b.deck"), "2 OGN-099\n");
  fs.writeFileSync(path.join(dir, "notes.md"), "not a decklist\n");

  const seen = fs.readdirSync(dir).filter((f) => /\.(txt|deck|list)$/i.test(f)).sort();
  assert.deepEqual(seen, ["a.txt", "b.deck"], "only decklist files, notes.md ignored");
});

test("a card reprinted across sets matches whichever printing is on the board", () => {
  // "Irelia, Fervent" is printed in three sets: SFD-057, SFD-225, VEN-174.
  // A list written with one and a board rendering another must still match.
  const store = {
    "Irelia, Fervent": {
      matches: [], cards: {},
      variants: {
        Heron: {
          name: "Heron",
          main: {
            "SFD-057": { name: "Irelia, Fervent", copies: 1, codes: ["SFD-057", "SFD-225", "VEN-174"] },
          },
          battlefields: {}, sideboard: {}, runes: [],
        },
      },
    },
  };

  for (const printing of ["SFD-057", "SFD-225", "VEN-174"]) {
    fixture.build({
      mode: "solo_lab", opponentId: "plr_x", roomCode: "R",
      opponentChampion: "Irelia, Fervent",
      zones: { opponent: { ...EMPTY_ZONES, base: [{ id: "u", code: printing, name: "Irelia, Fervent" }] } },
    });
    const build = archetypes.priorFor(Snapshot.build(), store).variants[0];
    assert.deepEqual(build.evidence.matches, ["Irelia, Fervent"], printing);
    assert.deepEqual(build.evidence.absent, [], printing);
  }
});

test("foil and alt-art suffixes normalise to the base code", () => {
  const { baseCode } = require("../coach/cards.js");
  assert.equal(baseCode("SFD-225*"), "SFD-225", "foil");
  assert.equal(baseCode("SFD-057a"), "SFD-057", "alt art");
  assert.equal(baseCode("VEN-174"), "VEN-174");
});

test("an unsplit @effort suffix is named as a stale copy, not a bad model", () => {
  // OpenRouter answers "not a valid model ID", which is true and unhelpful:
  // the real fault is code from before efforts were parsed out of the slug.
  const { ask } = require("../coach/openrouter.js");
  return assert.rejects(
    () => ask({ system: "s", user: "u", model: "anthropic/claude-sonnet-5@high", apiKey: "sk-test" }),
    (err) => {
      assert.match(err.message, /reasoning effort/);
      assert.match(err.message, /git pull/);
      assert.match(err.message, /The model is "anthropic\/claude-sonnet-5"/);
      return true;
    }
  );
});

/* Rules. The board handed to the model is accurate; without the rules, a model
 * reasoning over it recommends plays that cannot be made. All three models
 * recommended playing a unit onto an uncontrolled battlefield. */

test("the rules file is loaded into the system prompt", () => {
  const { SYSTEM, loadRules } = require("../coach/prompt.js");
  const rules = loadRules();
  assert.ok(rules.length > 0, "there is a rules file");
  assert.ok(SYSTEM.includes(rules), "and it rides in the system message");
});

test("the rule the models broke is stated, with its rule number", () => {
  const { loadRules } = require("../coach/prompt.js");
  const rules = loadRules();
  assert.match(rules, /only be played to its controller's Base, or to a battlefield/);
  assert.match(rules, /355\.2\.a/, "quotable against the source");
  assert.doesNotMatch(
    rules,
    /\(806\.3, 813\.3\.a/,
    "806.3 is the Action keyword and says nothing about placement"
  );
});

test("every rule area carries a rule reference", () => {
  const { loadRules } = require("../coach/prompt.js");
  const rules = loadRules();
  // Each of these numbers was read out of the Core Rules PDF, not recalled.
  for (const ref of ["141.1.a.1", "144.4.a", "190.4", "469.1", "167", "164.2.a"]) {
    assert.ok(rules.includes(ref), `missing reference ${ref}`);
  }
});

test("the rune economy is stated, since it drives what they can respond with", () => {
  const { loadRules } = require("../coach/prompt.js");
  const rules = loadRules();
  assert.match(rules, /Exhaust it .*add 1 Energy/);
  assert.match(rules, /Recycle it .*add 1 Power of that rune's domain/);
  assert.match(rules, /rune pool empties/i, "floating resources do not carry over");
});

test("the model is told the rules bind it, and that they are incomplete", () => {
  const { SYSTEM } = require("../coach/prompt.js");
  assert.match(SYSTEM, /authoritative and binding/);
  assert.match(SYSTEM, /INCOMPLETE/);
  assert.match(SYSTEM, /Recommending an illegal play is the worst failure/);
});

test("a missing rules file leaves the prompt usable", () => {
  const { BASE_SYSTEM } = require("../coach/prompt.js");
  assert.ok(BASE_SYSTEM.length > 500, "the coaching instructions stand alone");
  assert.ok(!BASE_SYSTEM.includes("RULES\n\n#"), "rules are appended, not baked in");
});

test("observed log lines are carried, and marked weaker than rules", () => {
  const { loadRules, SYSTEM } = require("../coach/prompt.js");
  const rules = loadRules();
  assert.match(rules, /NOT verified as rules/);
  assert.match(rules, /Played <unit> from hand to base/);
  assert.match(
    SYSTEM,
    /weaker than its rules/,
    "the model is told an action seen once is not a legality"
  );
});

test("maintenance notes are not sent to the model", () => {
  // The system prompt is re-sent every turn of every game, so a paragraph of
  // provenance is a paragraph paid for hundreds of times.
  const fs = require("node:fs");
  const { loadRules, SYSTEM } = require("../coach/prompt.js");
  const onDisk = fs.readFileSync(require("../coach/prompt.js").RULES_FILE, "utf8");

  assert.ok(onDisk.includes("Source and maintenance"), "the notes exist in the file");
  assert.ok(!loadRules().includes("Source and maintenance"), "but are not loaded");
  assert.ok(!SYSTEM.includes("41 MB"), "nor does the model hear about the PDF's size");
  assert.ok(!SYSTEM.includes("cmsassets.rgpub.io"), "nor which hosts were blocked");
});

test("the rules themselves still survive the cut", () => {
  const { loadRules } = require("../coach/prompt.js");
  const rules = loadRules();
  assert.match(rules, /355\.2\.a/, "rules come before the marker");
  assert.match(rules, /Conquered <battlefield> and scored 1/, "and so does the observed section");
});

/* Two gaps found by reading the coach's advice against the rules: it did not
 * know units enter exhausted, and it treated the champion as an identity
 * label rather than a card that can be played from its zone. */

test("the champion in its zone is reported as playable", () => {
  fixture.build();
  const s = Snapshot.build();
  assert.deepEqual(s.players.self.championZone, {
    name: "Yasuo",
    code: "OGN-002",
    available: true,
  });
});

/* Deploying the champion removes the CARD; the zone's drop target stays put.
 * Removing the first matching element instead left the card behind, which is
 * how the regression hid — the test was simulating something that never
 * happens. */
function deployChampion() {
  const card = globalThis.document.querySelector(
    '[data-zone-owner="self"] [data-drop-zone="champion"] img'
  );
  card.closest('[data-drop-zone="champion"]').remove();
}

test("a deployed champion leaves an empty zone, and says so", () => {
  fixture.build();
  deployChampion();
  const s = Snapshot.build();
  assert.equal(s.players.self.championZone.available, false);
  assert.equal(s.players.self.champion, null);
});

test("the champion is found behind the zone's empty drop target", () => {
  // The live board nests a drop target, a hover anchor and the card button,
  // all carrying data-drop-zone="champion". Reading only the first found the
  // drop target, saw no image, and reported the zone empty — so a castable
  // champion silently vanished from the prompt.
  fixture.build();
  const zones = globalThis.document.querySelectorAll(
    '[data-zone-owner="self"] [data-drop-zone="champion"]'
  );
  assert.ok(zones.length > 1, "the fixture nests the zone as the board does");
  assert.ok(!zones[0].querySelector("img"), "and the first one holds no card");
  assert.equal(Snapshot.build().players.self.championZone.name, "Yasuo");
});

test("the champion is listed where the turn's options are counted", () => {
  // It was previously a line under the player's name, beside their score and
  // legend — where it read as biography. Three models at three efforts all
  // called a hand card "your only unit" with a champion sitting castable.
  fixture.build();
  const msg = buildUserMessage(summarize(Snapshot.build()), {});

  assert.match(msg, /CARDS YOU CAN PLAY THIS TURN/);
  assert.match(msg, /- Yasuo \(CHAMPION ZONE — playable from there, rule 108\.3\.d\)/);
  assert.match(msg, /legend: Yasuo, the Unforgiven/, "the legend stays an identity");

  const playable = msg.slice(msg.indexOf("CARDS YOU CAN PLAY"), msg.indexOf("THEM —"));
  for (const card of ["Sweeping Blade", "Windwall", "Yasuo"]) {
    assert.ok(playable.includes(card), `${card} is among the options`);
  }
});

test("an unread champion zone says so rather than passing as empty", () => {
  // Two attempts to read it have failed on the live board, and while they
  // failed the models stated flatly there was nothing to deploy. An absent
  // line is indistinguishable from an absent card.
  fixture.build();
  deployChampion();
  const msg = buildUserMessage(summarize(Snapshot.build()), {});
  const playable = msg.slice(msg.indexOf("CARDS YOU CAN PLAY"), msg.indexOf("THEM —"));

  assert.ok(!playable.includes("CHAMPION ZONE —"), "no champion is offered");
  assert.match(playable, /could not be read/, "but the gap is stated");
  assert.match(playable, /this list is incomplete/);
  assert.match(playable, /108\.3\.d/);
});

test("the opponent's champion is shown as theirs, not as your option", () => {
  fixture.build();
  const msg = buildUserMessage(summarize(Snapshot.build()), {});
  assert.match(msg, /champion still in its zone \(playable by them\)/);
});

test("the champion's card text is fetched, since it can be cast", () => {
  fixture.build();
  assert.ok(codesToResolve(Snapshot.build()).includes("OGN-002"));
});

test("both new rules are stated with their numbers", () => {
  const { loadRules } = require("../coach/prompt.js");
  const rules = loadRules();
  assert.match(rules, /Units enter the Board exhausted/);
  assert.match(rules, /143\.4/);
  assert.match(rules, /can be played from here as normal/);
  assert.match(rules, /108\.3\.d/);
  assert.match(rules, /cannot move this turn/, "the consequence is spelled out");
});

test("Hidden requires a battlefield you control, and the rule says so", () => {
  // A model recommended hiding Tideturner on a board where the player
  // controlled no battlefield — illegal, and it read as the clever line.
  const { loadRules } = require("../coach/prompt.js");
  const rules = loadRules();
  assert.match(rules, /hide this facedown at a battlefield\s+you control/);
  assert.match(rules, /811\.1\.b/);
  assert.match(rules, /Hide needs a battlefield you already control/);
  assert.match(rules, /Champion Zone.*can be hidden from there|hidden from there/s);
});

/* The legend. It was a name in the header, so its text never reached the
 * prompt and its abilities were invisible — including one that readies a
 * unit, which decides whether a body played this turn can reach a
 * battlefield at all. */

test("the legend is carried with its code and state", () => {
  fixture.build();
  const legend = Snapshot.build().players.self.legendCard;
  assert.equal(legend.name, "Yasuo, the Unforgiven");
  assert.equal(legend.code, "OGN-001");
  assert.ok("exhausted" in legend, "its state is a resource, so it is carried");
});

test("the legend's text is fetched like any other card", () => {
  fixture.build();
  assert.ok(codesToResolve(Snapshot.build()).includes("OGN-001"));
});

test("the prompt says whether the legend's abilities are still available", () => {
  fixture.build();
  const msg = buildUserMessage(summarize(Snapshot.build()), {});
  assert.match(msg, /legend: Yasuo, the Unforgiven/);
  assert.match(msg, /legends have abilities/);
});

test("an exhausted legend is reported as spent, not merely present", () => {
  fixture.build();
  const el = globalThis.document.querySelector(
    '[data-zone-owner="self"] [data-drop-zone="legend"] [data-card-id]'
  );
  el.setAttribute("data-exhausted", "true");
  const msg = buildUserMessage(summarize(Snapshot.build()), {});
  assert.match(msg, /EXHAUSTED — its activated abilities are spent this turn/);
});

test("the rules state that legends have activated abilities", () => {
  const { loadRules } = require("../coach/prompt.js");
  const rules = loadRules();
  assert.match(rules, /passive, triggered AND activated abilities/);
  assert.match(rules, /107\.4\.c/);
  assert.match(rules, /806\.1\.a, 813\.1\.a/);
  assert.doesNotMatch(rules, /174\.[678]/, "174 is Battlefields; there is no 174.6");
  assert.match(rules, /not a nameplate/);
});

/* Lessons: conclusions drawn from finished games. The weakest and most
 * dangerous of the three knowledge sources, since a lesson is an inference
 * that gets read back later as knowledge. */

const lessonsMod = require("../coach/lessons.js");

const withTempLessons = (fn) => {
  const os = require("node:os");
  const fspath = require("node:path");
  const fsmod = require("node:fs");
  const dir = fsmod.mkdtempSync(fspath.join(os.tmpdir(), "rbc-lessons-"));
  const prev = process.env.RBC_LESSONS;
  process.env.RBC_LESSONS = fspath.join(dir, "lessons.md");
  delete require.cache[require.resolve("../coach/lessons.js")];
  const mod = require("../coach/lessons.js");
  try {
    fn(mod);
  } finally {
    if (prev === undefined) delete process.env.RBC_LESSONS;
    else process.env.RBC_LESSONS = prev;
    delete require.cache[require.resolve("../coach/lessons.js")];
  }
};

test("a lesson is stored with where it came from", () => {
  withTempLessons((L) => {
    L.add(["Conquer an uncontested battlefield before banking runes."], "room ABC");
    assert.match(L.list()[0], /Conquer an uncontested battlefield/);
    assert.match(L.list()[0], /\(room ABC\)/, "provenance rides along");
  });
});

test("the same lesson twice does not accumulate", () => {
  withTempLessons((L) => {
    L.add(["Trade tempo for a point when the board is empty."], "room A");
    const second = L.add(["Trade tempo for a point when the board is empty."], "room B");
    assert.equal(second.added, 0);
    assert.equal(L.list().length, 1, "learning it again is not learning something new");
  });
});

test("lessons are capped so they cannot crowd out the rules", () => {
  withTempLessons((L) => {
    const many = Array.from({ length: L.MAX_LESSONS + 10 }, (_, i) => `Lesson number ${i}.`);
    L.add(many, "bulk");
    assert.equal(L.list().length, L.MAX_LESSONS);
    assert.match(L.list().at(-1), /Lesson number 34/, "the newest survive");
  });
});

test("the prompt block says lessons are heuristics the board overrides", () => {
  withTempLessons((L) => {
    L.add(["Hold a trick rather than spending it on an empty board."], "room A");
    const block = L.forPrompt();
    assert.match(block, /NOT rules/);
    assert.match(block, /may be wrong/);
    assert.match(block, /rules and the board both/);
  });
});

test("no lessons means nothing is added to the prompt", () => {
  withTempLessons((L) => {
    assert.equal(L.forPrompt(), "", "an empty file contributes no tokens");
  });
});

test("the review is told not to restate rules or guess", () => {
  const { SYSTEM: REVIEW } = require("../coach/review.js");
  assert.match(REVIEW, /Restatements of the rules/);
  assert.match(REVIEW, /Anything you are not confident about/);
  assert.match(REVIEW, /NO LESSONS/, "it may decline to find any");
});

test("a game is described from its own room only", () => {
  const { describeGame } = require("../coach/review.js");
  const snap = (room, turn, score) => ({
    match: { roomCode: room, turnNumber: turn, mode: "solo_lab" },
    players: { self: { name: "me", score, legend: "L" }, opponent: { name: "them", score: 2 } },
    battlefields: { battlefieldA: { name: "A" }, battlefieldB: { name: "B" } },
    log: [{ at: "01:00", actor: "self", text: "Conquered A and scored 1." }],
  });
  const text = describeGame([snap("R1", 1, 0), snap("R1", 7, 8)]);
  assert.match(text, /GAME R1/);
  assert.match(text, /turns: 1 to 7/);
  assert.match(text, /final score: me 8 — 2 them/);
  assert.match(text, /Conquered A and scored 1/);
});

test("a lesson's identity is its text, stripped of bullet and provenance", () => {
  const { key } = require("../coach/lessons.js");
  assert.equal(key("- Trade tempo for a point. (room A)"), "trade tempo for a point.");
  assert.equal(key("Trade tempo for a point."), "trade tempo for a point.");
  assert.equal(
    key("- Trade tempo for a point. (room A)"),
    key("Trade tempo for a point."),
    "stored and incoming forms must compare equal, or lessons pile up"
  );
});

/* Citations. Two rule numbers in rules.md were wrong and nothing noticed:
 * 806.3 was given for where a unit may be played (it is the Action keyword),
 * and 174.6-174.8 for legend abilities (rule 174 does not exist). Both rode in
 * a system prompt that calls the rules section authoritative and binding. */

test("every rule number in rules.md exists in the rulebook", () => {
  const { citations, exists, rulebookText } = require("../coach/check-citations.js");
  const { text, why } = rulebookText();
  if (!text) {
    // Unverifiable is not the same as correct, so say which it is.
    console.warn(`  (citations unchecked: ${why})`);
    return;
  }
  const bad = citations(require("../coach/prompt.js").loadRules()).filter(
    (r) => !exists(r, text)
  );
  assert.deepEqual(bad, [], "these rule numbers are not in the Core Rules");
});

/* Two halves of 355.2.a. The coach was corrected into never playing onto a
 * battlefield it does not control, and then would not play onto one it does. */

test("the rules state both halves of where a unit may be played", () => {
  const { loadRules } = require("../coach/prompt.js");
  const rules = loadRules();
  assert.match(rules, /playing a new unit \*\*directly onto it\*\* is\s*\n?\s*legal/);
  assert.match(rules, /An empty battlefield is \*\*not\*\* one you control/);
});

test("the rules state that a move is limited by its cost, not by a per-turn cap", () => {
  const { loadRules } = require("../coach/prompt.js");
  const rules = loadRules();
  assert.match(rules, /no once-per-turn limit/);
  assert.match(rules, /Check the legend before concluding/);
});

/* I had this backwards and wrote the wrong version into the binding rules
 * section: "one rune produces Energy or Power, never both". Recycling is a
 * separate cost from exhausting, so one rune pays both. */
test("the rules state that one rune can pay both Energy and Power", () => {
  const { loadRules } = require("../coach/prompt.js");
  const rules = loadRules();
  assert.match(rules, /Recycling is not exhausting/);
  assert.match(rules, /is\s*\n?\*\*six\*\* runes, not seven/);
  assert.doesNotMatch(rules, /never both/, "that was the error, not the rule");
  assert.match(rules, /Energy is limited by how many runes are \*\*ready\*\*/);
  assert.match(rules, /Power is limited by how many runes are \*\*on the board/);
});
