"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../coach/engine.js");

const SAMPLE_TIED = `ranking 5 legal action(s) for P1, 150 rollout(s) each
hidden cards sampled per rollout: P1 0, P2 4

   80.0%  P1: PlayCard card=2                           (120-30)
   74.7%  P1: PlayCard card=9                           (112-38)
   38.0%  P1: EndTurn                                   (57-93)

TOO CLOSE TO CALL: the top 4 actions are within noise of each other at 150 rollouts.
  Worst: "P1: EndTurn" at 38.0% — that gap IS outside the noise.
`;

const SAMPLE_CLEAR = `ranking 5 legal action(s) for P1, 1200 rollout(s) each

   82.7%  P1: PlayCard card=2                           (992-208)
   37.2%  P1: EndTurn                                   (447-753)

CLEAR: "P1: PlayCard card=2" is ahead of the next option by more than the noise at 1200 rollouts.
  Worst: "P1: EndTurn" at 37.2% — that gap IS outside the noise.
`;

test("a ranking report parses into rows, rates and counts", () => {
  const r = E.parseRanking(SAMPLE_CLEAR);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].action, "P1: PlayCard card=2");
  // Float division: 82.7/100 is not exactly 0.827.
  assert.ok(Math.abs(r.rows[0].rate - 0.827) < 1e-9);
  assert.equal(r.rows[0].wins, 992);
  assert.equal(r.worst.action, "P1: EndTurn");
});

/* The distinction the whole thing turns on: a ranking that separates its top
 * option, and one that does not. Handing the model a false ordering is how a
 * confident wrong line gets written up persuasively. */
test("a separated top is reported as separated", () => {
  const r = E.parseRanking(SAMPLE_CLEAR);
  assert.equal(r.tiedAtTop, 1);
  assert.equal(r.best, "P1: PlayCard card=2");
});

test("a tied top is reported as tied, with the count", () => {
  const r = E.parseRanking(SAMPLE_TIED);
  assert.equal(r.tiedAtTop, 4);
  assert.equal(r.best, null);
});

test("the prompt block never presents a tied option as best", () => {
  const block = E.rankingBlock(E.parseRanking(SAMPLE_TIED));
  assert.match(block, /within the noise/);
  assert.match(block, /Do not present one as best/);
  assert.doesNotMatch(block, /Lead with it/);
});

test("the prompt block leads with a separated winner", () => {
  const block = E.rankingBlock(E.parseRanking(SAMPLE_CLEAR));
  assert.match(block, /separates "P1: PlayCard card=2"/);
  assert.match(block, /Lead with it/);
});

test("the worst option is always surfaced, since that gap is the reliable one", () => {
  for (const s of [SAMPLE_TIED, SAMPLE_CLEAR]) {
    assert.match(E.rankingBlock(E.parseRanking(s)), /Worst by a clear margin/);
  }
});

test("caveats about the simulated board ride with the ranking", () => {
  const block = E.rankingBlock(E.parseRanking(SAMPLE_CLEAR), ["their hand is sampled"]);
  assert.match(block, /How the simulated board differs/);
  assert.match(block, /their hand is sampled/);
});

/* Fails closed, every way in. */
test("no decklists means no ranking, with the reason", () => {
  const r = E.rankBoard({}, {});
  assert.equal(r.ok, false);
  assert.match(r.why, /decklist for BOTH players|not built|alpharune checkout/);
});

test("the default rollout count is the one the measurement supports", () => {
  assert.ok(E.DEFAULT_ROLLOUTS >= 1000, "below ~1000 the ranker cannot separate options");
});

/* A card can map to the engine perfectly and still not be in the decklist
 * supplied — which means the list is not the deck being played. Caught before
 * the engine runs, because a position that dropped three cards still ranks,
 * and still prints percentages. */
const fs = require("fs");
const path = require("path");
const A = require("../coach/alpharune.js");

let idx = null;
try { idx = A.loadIndex(); } catch (_) { /* engine checkout absent */ }
const withIdx = (fn) => () => (idx ? fn() : undefined);

const DECKS = "/home/user/chorlick/alpharune/decks";
const haveDecks = fs.existsSync(DECKS);

test(
  "a placed card missing from its player's decklist is reported",
  withIdx(() => {
    if (!haveDecks) return;
    const script = [
      "place P1 Tideturner hand",
      "place P1 Nonexistent Card base",
    ].join("\n");
    const missing = E.checkAgainstDecks(
      script, path.join(DECKS, "draven_test.txt"), path.join(DECKS, "fiora_test.txt"), idx
    );
    assert.equal(missing.length, 1);
    assert.equal(missing[0].name, "Nonexistent Card");
  })
);

test(
  "a card in the right deck passes, and the same card in the wrong one does not",
  withIdx(() => {
    if (!haveDecks) return;
    const d1 = path.join(DECKS, "draven_test.txt");
    const d2 = path.join(DECKS, "fiora_test.txt");
    assert.deepEqual(E.checkAgainstDecks("place P1 Tideturner hand", d1, d2, idx), []);
    assert.equal(E.checkAgainstDecks("place P2 Tideturner hand", d1, d2, idx).length, 1);
  })
);

/* A decklist names a legend with its champion tag; the engine does not. Both
 * sides are resolved through the index so the comparison is like for like. */
test(
  "a champion-tagged decklist entry still matches the engine's card name",
  withIdx(() => {
    if (!haveDecks) return;
    const d1 = path.join(DECKS, "fiora_test.txt");
    // fiora_test.txt says "Fiora, Grand Duelist"; the card is "Grand Duelist".
    assert.deepEqual(
      E.checkAgainstDecks("place P1 Grand Duelist base", d1, d1, idx),
      [],
      "the tag must not defeat the comparison"
    );
  })
);

test("an unreadable decklist is reported rather than thrown", () => {
  const m = E.checkAgainstDecks("place P1 X hand", "/nope/a.txt", "/nope/b.txt", idx || { byCode: new Map(), byName: new Map(), rows: [] });
  assert.equal(m.length, 1);
  assert.match(m[0].why, /could not read a decklist/);
});
