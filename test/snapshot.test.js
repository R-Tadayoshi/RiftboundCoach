"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./fixtures/board.js");

const Exhaust = require("../extension/src/exhaust.js");
require("../extension/src/board.js");
require("../extension/src/visibility.js");
const Snapshot = require("../extension/src/snapshot.js");

test("builds a full snapshot from a live board", () => {
  fixture.build();
  const s = Snapshot.build({ now: Date.parse("2026-09-19T16:11:00Z") });

  assert.equal(s.schemaVersion, 1);
  assert.equal(s.capturedAt, "2026-09-19T16:11:00.000Z");
  assert.equal(s.sequence, "412");

  assert.deepEqual(s.match, {
    roomCode: "QWLM",
    phase: "in_game",
    mode: "constructed",
    turnNumber: 7,
    activeSide: "self",
    isMyTurn: true,
  });

  assert.equal(s.players.self.name, "curtyo");
  assert.equal(s.players.self.score, 3);
  assert.equal(s.players.opponent.champion, "Lux");
  assert.equal(s.players.opponent.score, 5);
});

test("isMyTurn is null, not false, when the turn cannot be read", () => {
  fixture.build({ activeId: "p-nobody" });
  const s = Snapshot.build();
  assert.equal(s.match.activeSide, null);
  assert.equal(s.match.isMyTurn, null, "unknown is not 'their turn'");
});

test("every zone appears for both sides, present or empty", () => {
  fixture.build();
  const s = Snapshot.build();
  const zones = ["hand", "base", "battlefieldA", "battlefieldB", "runeArea", "trash"];
  for (const side of ["self", "opponent"]) {
    assert.deepEqual(Object.keys(s.zones[side]), zones, side);
    for (const z of zones) {
      const block = s.zones[side][z];
      assert.equal(typeof block.count, "number");
      assert.ok(Array.isArray(block.visible));
      assert.equal(typeof block.hiddenCount, "number");
      assert.equal(block.count, block.visible.length + block.hiddenCount, `${side}.${z} adds up`);
    }
  }
});

test("the opponent's hand is a count and nothing else", () => {
  fixture.build();
  const s = Snapshot.build();
  assert.deepEqual(s.zones.opponent.hand, { count: 4, visible: [], hiddenCount: 4 });
});

test("no board means no snapshot", () => {
  fixture.buildEmpty();
  assert.equal(Snapshot.build(), null);
});

test("flags exhaustion as unread when the board carries no marker", () => {
  fixture.build();
  const s = Snapshot.build();
  assert.deepEqual(s.fieldsUnread, ["exhausted"]);
  assert.ok(s.warnings.some((w) => /exhausted\/readied state could not be read/.test(w)));
  for (const card of s.zones.self.base.visible) {
    assert.equal(card.exhausted, null, "null means unknown, not readied");
  }
});

test("reads exhaustion when the board does mark it", () => {
  fixture.build({
    zones: {
      self: {
        base: [
          { id: "s-b1", code: "OGN-031", name: "Steadfast Guard", attrs: ' data-exhausted="true"' },
          { id: "s-b2", code: "OGN-032", name: "Fresh Recruit", attrs: ' data-exhausted="false"' },
        ],
      },
    },
  });
  const s = Snapshot.build();
  const base = s.zones.self.base.visible;
  assert.equal(base[0].exhausted, true);
  assert.equal(base[1].exhausted, false);
  assert.deepEqual(s.fieldsUnread, [], "no longer unread once a marker is present");
});

test("exhaust probe answers null rather than guessing", () => {
  assert.equal(Exhaust.read(null), null);
  assert.equal(Exhaust.read({}), null);
  fixture.build();
  const bare = globalThis.document.querySelector("[data-card-id]");
  assert.equal(Exhaust.read(bare), null);
});

test("exhaust probe reads a state enum", () => {
  fixture.build();
  const el = globalThis.document.querySelector("[data-card-id]");
  el.setAttribute("data-state", "exhausted");
  assert.equal(Exhaust.read(el), true);
  el.setAttribute("data-state", "readied");
  assert.equal(Exhaust.read(el), false);
  el.setAttribute("data-state", "hovered");
  assert.equal(Exhaust.read(el), null, "an unrelated state is not an answer");
});

test("hasLiveOpponent distinguishes a seated player from an empty seat", () => {
  fixture.build();
  assert.equal(Snapshot.hasLiveOpponent(globalThis.document.querySelector('[data-testid="game-state"]')), true);

  fixture.build();
  const board = globalThis.document.querySelector('[data-testid="game-state"]');
  board.removeAttribute("data-opponent-player-id");
  assert.equal(Snapshot.hasLiveOpponent(board), false, "goldfishing: nobody across the table");
});

test("the log is capped to the requested window", () => {
  fixture.build();
  assert.equal(Snapshot.build({ logLimit: 2 }).log.length, 2);
  assert.equal(Snapshot.build({ logLimit: 2 }).log[0].text, "Played Ionian Duelist.");
});
