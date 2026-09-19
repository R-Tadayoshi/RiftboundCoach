"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./fixtures/board.js");

const Exhaust = require("../extension/src/exhaust.js");
const Board = require("../extension/src/board.js");
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
    turnStep: "action",
    activeSide: "self",
    activeSeat: "seat-a",
    isMyTurn: true,
  });
  assert.deepEqual(s.connection, { state: "open", resetToken: "rt-1" });

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

test("reads exhaustion off data-exhausted, the board's own marker", () => {
  fixture.build();
  const s = Snapshot.build();
  assert.equal(s.zones.self.base.visible[0].exhausted, false);
  assert.equal(s.zones.self.battlefieldA.visible[0].exhausted, true);
  assert.deepEqual(s.fieldsUnread, [], "readable, so nothing is flagged unread");
  assert.deepEqual(s.warnings, []);
});

test("a card in hand reads null, because it carries no exhaustion", () => {
  fixture.build();
  for (const card of Snapshot.build().zones.self.hand.visible) {
    assert.equal(card.exhausted, null, "absent is unknown, never readied");
  }
});

test("flags exhaustion as unread when the marker disappears entirely", () => {
  // What a restyle that renames data-exhausted would look like.
  fixture.build();
  for (const el of globalThis.document.querySelectorAll("[data-exhausted]")) {
    el.removeAttribute("data-exhausted");
  }
  const s = Snapshot.build();
  assert.deepEqual(s.fieldsUnread, ["exhausted"]);
  assert.ok(s.warnings.some((w) => /the markup moved/.test(w)));
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


/* The board fills what it cannot answer with the literal string "unknown"
 * rather than omitting the attribute. Every one of these read as a real value
 * before that was found in the site's own bundle. */

test("a goldfish is not mistaken for a seated opponent", () => {
  fixture.buildGoldfish();
  const board = globalThis.document.querySelector('[data-testid="game-state"]');
  assert.equal(
    Snapshot.hasLiveOpponent(board),
    false,
    'an "unknown" opponent id is an empty seat, not a player'
  );
});

test("solo capture is not paused by the unknown sentinel", () => {
  // The bug this guards: soloOnly would pause during exactly the solo
  // practice the extractor is built for.
  fixture.buildGoldfish();
  const s = Snapshot.build();
  assert.ok(s, "a goldfish still produces a snapshot");
  assert.equal(s.match.turnNumber, null, '"unknown" is not a turn number');
  assert.equal(s.match.activeSide, null);
  assert.equal(s.match.isMyTurn, null);
});

test("an unknown score falls through rather than reading as a number", () => {
  fixture.buildGoldfish();
  const board = globalThis.document.querySelector('[data-testid="game-state"]');
  assert.equal(Board.score(board, "opponent"), null);
});

test("warns when the realtime socket is not open", () => {
  fixture.build({ connectionState: "closed" });
  const s = Snapshot.build();
  assert.equal(s.connection.state, "closed");
  assert.ok(
    s.warnings.some((w) => /may be stale/.test(w)),
    "a stale board says so rather than passing as current"
  );

  fixture.build({ connectionState: "open" });
  assert.ok(!Snapshot.build().warnings.some((w) => /may be stale/.test(w)));
});

test("reads card codes from the real flat art path", () => {
  fixture.build();
  const hand = Board.zoneCards("self", "hand");
  assert.deepEqual(hand.map((c) => c.code), ["OGN-004", "OGN-017"]);
});

test("card-back art is face-down even if the alt text is unhelpful", () => {
  fixture.build();
  const img = globalThis.document.querySelector(
    '[data-drop-zone-root="hand"][data-zone-owner="opponent"] [data-card-id] img'
  );
  img.setAttribute("alt", "Card"); // localised, says nothing
  const hand = Board.zoneCards("opponent", "hand");
  assert.equal(hand[0].faceDown, true, "the art path settles it");
  assert.equal(hand[0].code, null);
});

/* Two-Sided Practice (solo_lab) seats a real opponent id and a real opposing
 * board, both of them the player's own. Captured live, room 3SUWS. */

test("two-sided practice counts as solo practice", () => {
  fixture.build({ mode: "solo_lab", opponentId: "plr_4eec6e4d" });
  const board = globalThis.document.querySelector('[data-testid="game-state"]');
  assert.equal(Snapshot.hasLiveOpponent(board), true, "a seat is filled");
  assert.equal(
    Snapshot.isSoloPractice(board),
    true,
    "but both seats are yours, so coaching is not assistance against anyone"
  );
});

test("goldfish counts as solo practice", () => {
  fixture.build({ mode: "single_player", opponentId: "unknown" });
  const board = globalThis.document.querySelector('[data-testid="game-state"]');
  assert.equal(Snapshot.isSoloPractice(board), true);
});

test("a real match against a person does not", () => {
  fixture.build({ mode: "multiplayer", opponentId: "plr_someone_else" });
  const board = globalThis.document.querySelector('[data-testid="game-state"]');
  assert.equal(Snapshot.isSoloPractice(board), false);
});

test("an unrecognised mode with someone seated is refused, not allowed", () => {
  fixture.build({ mode: "some_future_mode", opponentId: "plr_someone_else" });
  const board = globalThis.document.querySelector('[data-testid="game-state"]');
  assert.equal(
    Snapshot.isSoloPractice(board),
    false,
    "a new mode name should cost a pause, not a silent coaching session"
  );
});

test("an unrecognised mode with nobody seated is still solo", () => {
  fixture.build({ mode: "some_future_mode", opponentId: "unknown" });
  const board = globalThis.document.querySelector('[data-testid="game-state"]');
  assert.equal(Snapshot.isSoloPractice(board), true);
});
