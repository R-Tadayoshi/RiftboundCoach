"use strict";
/* coach/engine.js end to end: a summary in, a ranking out, with the real
 * translator, the real decklists and the real engine binary in between.
 *
 * Everything else tests one side of that boundary. The JS has been correct
 * while the C++ refused the position, and the C++ has been correct while the
 * JS emitted names it could not resolve; neither suite noticed either time.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const E = require("../coach/engine.js");

const ALPHARUNE =
  process.env.ALPHARUNE_ROOT || path.join(__dirname, "..", "..", "chorlick", "alpharune");
const DECKS = path.join(ALPHARUNE, "decks");
const D1 = path.join(DECKS, "fiora_test.txt");
const D2 = path.join(DECKS, "draven_test.txt");

const why = E.unavailable();
const ready = !why && fs.existsSync(D1) && fs.existsSync(D2);
if (!ready) console.warn(`  (rank integration skipped: ${why || "no decks"})`);
const live = (fn) => () => (ready ? fn() : undefined);

/* A board built from cards that are genuinely in fiora_test.txt, because a
 * card not in the decklist is a different failure with a different message. */
const summary = (over = {}) => ({
  turn: { number: 11, step: "main", isMyTurn: true, mode: "constructed" },
  battlefields: {
    A: { name: "Targon's Peak", mine: [], theirs: [] },
    B: { name: "Targon's Peak", mine: [], theirs: [] },
  },
  me: {
    name: "Me", score: 5, floating: { energy: 0, power: 0 },
    runes: { total: 11, ready: 11, exhausted: 0, unknown: 0, byDomain: {} },
    hand: [
      { name: "Pit Rookie", code: null, exhausted: null },
      { name: "Challenge", code: null, exhausted: null },
    ],
    base: [], battlefieldA: [], battlefieldB: [{ name: "First Mate", code: null, exhausted: false }],
    trash: [], deck: { main: 20, rune: 2 },
    championZone: { name: null, code: null, available: false },
    legendCard: null,
    ...over.me,
  },
  them: {
    name: "Them", score: 6, floating: { energy: 0, power: 0 },
    runes: { total: 8, ready: 0, exhausted: 8, unknown: 0, byDomain: {} },
    handCount: 4, base: [], battlefieldA: [], battlefieldB: [], trash: [],
    deck: { main: 22, rune: 3 },
    championZone: { name: null, code: null, available: false }, legendCard: null,
    ...over.them,
  },
  fieldsUnread: [],
});

test(
  "a summary becomes a ranking, through the real translator and engine",
  live(() => {
    const r = E.rankBoard(summary(), { deck1: D1, deck2: D2, rollouts: 25, timeoutMs: 300000 });
    assert.equal(r.ok, true, r.why);
    assert.ok(r.ranking.rows.length >= 2, `expected several actions:\n${r.ranking.raw}`);

    for (const row of r.ranking.rows) {
      assert.ok(row.rate >= 0 && row.rate <= 1);
      assert.ok(row.wins + row.losses <= 25, "more results than rollouts");
    }
    // Passing the turn is the one ordering stable at any rollout count.
    assert.match(r.ranking.worst.action, /EndTurn/, r.ranking.raw);
  })
);

test(
  "the opponent's hand crosses as a count and is sampled, never as cards",
  live(() => {
    const r = E.rankBoard(summary(), { deck1: D1, deck2: D2, rollouts: 10 });
    assert.equal(r.ok, true, r.why);
    assert.match(r.ranking.raw, /hidden cards sampled per rollout: P1 0, P2 4/);
    assert.ok(r.caveats.some((c) => /sampled fresh per rollout/.test(c)));
  })
);

test(
  "a card not in the supplied decklist stops the run with that diagnosis",
  live(() => {
    // A card the engine models fine and the decklists do not contain, so
    // the refusal is about the DECKLIST and not about a keyword gap. Draven,
    // Audacious stood here until [Deflect] turned out to be uncharged, which
    // made the same board refuse for a different and equally true reason —
    // and this test is about the first one.
    const s = summary();
    s.me.hand = [{ name: "En Garde", code: "OGN-046", exhausted: null }];
    const r = E.rankBoard(s, { deck1: D1, deck2: D2, rollouts: 5 });
    assert.equal(r.ok, false);
    assert.match(r.why, /not in the decklist/);
  })
);

test("no decklists is a refusal that explains why both are needed", () => {
  const r = E.rankBoard(summary(), {});
  assert.equal(r.ok, false);
  assert.match(r.why, /decklist for BOTH players|not built|alpharune checkout/);
});
