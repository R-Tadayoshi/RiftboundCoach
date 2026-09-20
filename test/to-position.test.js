"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const fixture = require("./fixtures/board.js");
require("../extension/src/exhaust.js");
require("../extension/src/board.js");
require("../extension/src/visibility.js");
const Snapshot = require("../extension/src/snapshot.js");
const { summarize } = require("../coach/summarize.js");
const { toPosition } = require("../coach/to-position.js");
const A = require("../coach/alpharune.js");
const Fid = require("../coach/fidelity.js");

let ready = false;
try {
  ready = !!A.loadIndex() && Fid.scanCardFiles().size > 0;
} catch (err) {
  console.warn(`  (position tests skipped: ${err.message.split(".")[0]})`);
}
const withEngine = (fn) => () => (ready ? fn() : undefined);

const board = () => {
  fixture.build();
  return summarize(Snapshot.build());
};

test(
  "a captured board becomes a position script the engine can read",
  withEngine(() => {
    const { script } = toPosition(board());
    // Clearing comes first: a position replaces the dealt board.
    const lines = script.split("\n").filter((l) => l && !l.startsWith("#"));
    assert.equal(lines[0], "clear P1 all");
    assert.match(script, /^turnplayer P1$/m);
    assert.match(script, /^phase main$/m);
    assert.match(script, /^score P1 \d+$/m);
  })
);

test(
  "cards are named the way the ENGINE names them, not the board",
  withEngine(() => {
    const { script } = toPosition(board());
    // The fixture's legend is a champion-tagged display name; the engine's
    // card name is the tag-less half, and that is what has to be emitted.
    const expects = script.match(/^expect legend P1 (.+)$/m);
    assert.ok(expects, "the legend is asserted");
    assert.doesNotMatch(expects[1], /,/, "a champion tag leaked into the name");
  })
);

/* A legend cannot be placed — it comes from the deck file — so the script
 * asserts it. Ranking a position whose legend is not the one on screen gives
 * numbers about a different game. */
test(
  "the legend is asserted rather than placed",
  withEngine(() => {
    const { script } = toPosition(board());
    assert.match(script, /^expect legend P1 /m);
    assert.doesNotMatch(script, /^place P1 .* legend/m);
  })
);

test(
  "energy comes from ready runes and power from every rune on board",
  withEngine(() => {
    const s = board();
    s.me.runes = { total: 11, ready: 8, exhausted: 3, unknown: 0, byDomain: {} };
    const { script } = toPosition(s);
    assert.match(script, /^energy P1 8$/m, "only ready runes make energy");
    assert.match(script, /^power P1 11$/m, "an exhausted rune still recycles for power");
  })
);

test(
  "unreadable runes are assumed ready, and that assumption is stated",
  withEngine(() => {
    const s = board();
    s.me.runes = { total: 6, ready: 4, exhausted: 0, unknown: 2, byDomain: {} };
    const { script, caveats } = toPosition(s);
    assert.match(script, /^energy P1 6$/m);
    assert.ok(caveats.some((c) => /unreadable/.test(c)));
  })
);

/* The rule that decides whether any of this is worth trusting. */
test(
  "a card the engine cannot model faithfully blocks the whole position",
  withEngine(() => {
    // Found, not named: pinning a specific card makes this test break the day
    // that card gets implemented, reporting a regression where there is
    // progress.
    const index = A.loadIndex();
    const files = Fid.scanCardFiles();
    const stub = index.rows.find((c) => Fid.verdictFor(c, files).verdict === "STUB");
    if (!stub) return;

    const s = board();
    s.me.hand = [{ name: stub.name, code: stub.public_code, exhausted: null }];
    const { blocked } = toPosition(s);
    assert.ok(blocked.length >= 1, `${stub.name} should have blocked the position`);
    assert.ok(blocked.some((b) => b.name === stub.name));
  })
);

test(
  "a card the engine implements does not block",
  withEngine(() => {
    const s = board();
    s.me.hand = [{ name: "Draven, Audacious", code: "SFD-148", exhausted: null }];
    const { blocked } = toPosition(s);
    assert.deepEqual(blocked, []);
  })
);

test(
  "their hand is never written into the position, only counted",
  withEngine(() => {
    const s = board();
    s.them.handCount = 4;
    s.them.hand = [{ name: "Should Not Appear", code: "OGN-001" }];
    const { script, caveats } = toPosition(s);
    assert.doesNotMatch(script, /place P2 .* hand/, "opponent hand contents must not cross");
    assert.match(script, /^hidden P2 4$/m, "the count crosses, the contents do not");
    assert.ok(caveats.some((c) => /sampled fresh per/.test(c)));
  })
);

test(
  "a capture taken on their turn is flagged as useless for ranking my moves",
  withEngine(() => {
    const s = board();
    s.turn.isMyTurn = false;
    const { script, caveats } = toPosition(s);
    assert.match(script, /^turnplayer P2$/m);
    assert.ok(caveats.some((c) => /not on my turn/.test(c)));
  })
);

/* Determinization. The opponent's hand is a count we can read off the board
 * and contents we never can. Inventing one hand and reasoning as though it
 * were certain is the mistake alpharune's own ISMCTS makes — its resampler is
 * a Clone(), so its search reads the opponent's real cards. */
test(
  "their hand count crosses into the position as a sampling instruction",
  withEngine(() => {
    const s = board();
    s.them.handCount = 4;
    const { script } = toPosition(s);
    assert.match(script, /^hidden P2 4$/m);
    assert.doesNotMatch(script, /place P2 .* hand/);
  })
);

test(
  "an empty opponent hand declares nothing to sample",
  withEngine(() => {
    const s = board();
    s.them.handCount = 0;
    const { script } = toPosition(s);
    assert.doesNotMatch(script, /^hidden P2/m);
  })
);

test(
  "our own hand is placed, never sampled",
  withEngine(() => {
    const { script } = toPosition(board());
    assert.doesNotMatch(script, /^hidden P1/m, "we know our own hand");
    assert.match(script, /^place P1 .* hand$/m);
  })
);
