"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./fixtures/board.js");

// Load order mirrors the manifest: board.js calls into RBCExhaust.
require("../extension/src/exhaust.js");
const Board = require("../extension/src/board.js");

test("reads the match-level fields off the board root", () => {
  fixture.build();
  const board = Board.gameRoot();
  assert.ok(board, "board root found");
  assert.equal(Board.phase(board), "in_game");
  assert.equal(Board.mode(board), "constructed");
  assert.equal(Board.turnNumber(board), 7);
  assert.equal(Board.sequence(board), "412");
  assert.equal(Board.roomCode(), "QWLM");
});

test("resolves whose turn it is from the player ids", () => {
  fixture.build({ activeId: "p-self" });
  assert.equal(Board.activeSide(Board.gameRoot()), "self");

  fixture.build({ activeId: "p-opp" });
  assert.equal(Board.activeSide(Board.gameRoot()), "opponent");

  // A spectator, or an id naming nobody we know, is not a guess.
  fixture.build({ activeId: "p-someone-else" });
  assert.equal(Board.activeSide(Board.gameRoot()), null);
});

test("an unreadable field is null, never a default", () => {
  fixture.build();
  const board = Board.gameRoot();
  board.removeAttribute("data-turn-number");
  assert.equal(Board.turnNumber(board), null, "missing turn is null, not 0");

  board.removeAttribute("data-active-player-id");
  assert.equal(Board.activeSide(board), null);
});

test("scores come off the root, falling back to the track", () => {
  fixture.build();
  const board = Board.gameRoot();
  assert.equal(Board.score(board, "self"), 3);
  assert.equal(Board.score(board, "opponent"), 5);

  // With the root attributes gone, the ARIA track is the fallback.
  board.removeAttribute("data-viewer-score");
  const group = globalThis.document.createElement("div");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Your score track");
  group.innerHTML = `<button data-active="true" aria-label="Set your score to 4"></button>`;
  board.appendChild(group);
  assert.equal(Board.score(board, "self"), 4);
});

test("reads player names out of the identity badges", () => {
  fixture.build();
  assert.equal(Board.playerName("self"), "curtyo");
  assert.equal(Board.playerName("opponent"), "rival");
});

test("reads legend and champion per side", () => {
  fixture.build();
  assert.equal(Board.cardAlt("self", "champion"), "Yasuo");
  assert.equal(Board.cardAlt("opponent", "champion"), "Lux");
});

test("extracts the card code from the art URL", () => {
  assert.equal(
    Board.codeFromSrc("https://assets.riftatlas-workers.com/cards/OGN/OGN-004.webp"),
    "OGN-004"
  );
  // Tokens live under another path and carry no code.
  assert.equal(Board.codeFromSrc("https://assets.riftatlas-workers.com/tokens/wisp.webp"), null);
  assert.equal(Board.codeFromSrc(""), null);
  assert.equal(Board.codeFromSrc(undefined), null);
});

test("face-down cards are read as present but carry no identity", () => {
  fixture.build();
  const hand = Board.zoneCards("opponent", "hand");
  assert.equal(hand.length, 4, "all four card backs are counted");
  for (const card of hand) {
    assert.equal(card.faceDown, true);
    assert.equal(card.code, null, "no code off a card back");
    assert.equal(card.name, null, "no name off a card back");
    assert.ok(card.cardId, "still has an element id");
  }
});

test("face-up cards carry code and name", () => {
  fixture.build();
  const hand = Board.zoneCards("self", "hand");
  assert.equal(hand.length, 2);
  assert.deepEqual(
    hand.map((c) => c.code),
    ["OGN-004", "OGN-017"]
  );
  assert.equal(hand[0].name, "Sweeping Blade");
});

test("a face-down rune on your own side is still face-down", () => {
  fixture.build();
  const runes = Board.zoneCards("self", "runeArea");
  assert.equal(runes.length, 2);
  assert.equal(runes[0].faceDown, false);
  assert.equal(runes[1].faceDown, true, "the client did not reveal it to us either");
});

test("the log is returned oldest-first with actors attributed", () => {
  fixture.build();
  const log = Board.logEntries();
  assert.deepEqual(
    log.map((e) => e.actor),
    ["system", "self", "opponent"]
  );
  assert.equal(log[0].text, "Turn 7 begins.");
  assert.equal(log[2].text, "Conquered Ironspire and scored 1.");
});

test("no board means no reading, not an exception", () => {
  fixture.buildEmpty();
  assert.equal(Board.gameRoot(), null);
  assert.deepEqual(Board.zoneCards("self", "hand"), []);
  assert.deepEqual(Board.logEntries(), []);
  assert.equal(Board.roomCode(), null);
});
