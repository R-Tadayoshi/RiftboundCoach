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

/* Regressions from the first live goldfish capture (room YR6KC, turn 3).
 * The board reported 12 cards in a hand holding 4, 11 in a base holding 5, and
 * 10 runes where 5 were on the table. */

test("one card yields one entry, however many elements repeat its id", () => {
  fixture.build();
  const hand = Board.zoneCards("self", "hand");
  assert.equal(hand.length, 2, "two cards in hand, not two times the nesting");
  assert.equal(
    new Set(hand.map((c) => c.cardId)).size,
    hand.length,
    "every entry is a distinct card"
  );
});

test("the chosen element is the card button, so its state comes with it", () => {
  fixture.build();
  const base = Board.zoneCards("self", "base");
  assert.equal(base.length, 1);
  assert.equal(
    base[0].exhausted,
    false,
    "the preview-anchor wrapper would have answered null here"
  );
});

test("zone furniture is not counted as a card", () => {
  fixture.build();
  // The base carries a base-area marker element with a data-card-id.
  const base = Board.zoneCards("self", "base");
  assert.ok(
    !base.some((c) => Board.MARKER_ID_RE.test(c.cardId)),
    "no marker survives into the card list"
  );
  assert.ok(!base.some((c) => c.faceDown), "and none is reported as a hidden card");

  // An empty battlefield still carries its marker, and must read as empty.
  assert.deepEqual(Board.zoneCards("self", "battlefieldB"), []);
});

test("data-face-down outranks the art and the alt text", () => {
  fixture.build();
  const btn = globalThis.document.querySelector(
    '[data-drop-zone-root="hand"][data-zone-owner="self"] [data-board-card-visual="true"]'
  );
  btn.setAttribute("data-face-down", "true");
  const card = Board.zoneCards("self", "hand")[0];
  assert.equal(card.faceDown, true, "the board's own answer wins");
  assert.equal(card.code, null, "and no identity comes with it");
});

test("cards come back in drop-index order", () => {
  fixture.build();
  const runes = Board.zoneCards("self", "runeArea");
  assert.deepEqual(runes.map((c) => c.index), [0, 1]);
});

test("the player name drops the label's trailing purpose", () => {
  fixture.build();
  assert.equal(
    Board.playerName("self"),
    "curtyo",
    '"<name> profile and actions" is a label, not a name'
  );
});

test("a second rendering of the log does not duplicate its entries", () => {
  fixture.build();
  const doc = globalThis.document;
  const original = doc.querySelector("ul");
  original.parentElement.appendChild(original.cloneNode(true));

  const log = Board.logEntries();
  assert.equal(log.length, 3, "the richest single list, not both concatenated");
  assert.deepEqual(log.map((e) => e.actor), ["system", "self", "opponent"]);
});

/* Battlefields and the floating resource readout, from the solo_lab capture
 * (room 3SUWS). Both sit outside the zone roots, which is why reading a zone
 * found the units standing on a battlefield but never the battlefield. */

test("reads a battlefield's name out of its aria-label", () => {
  fixture.build();
  assert.equal(Board.battlefieldName("battlefieldA"), "Targon's Peak");
  assert.equal(Board.battlefieldName("battlefieldB"), "Dragon Roost");
});

test("both label shapes the live board uses are understood", () => {
  assert.equal(Board.nameFromLabel("Choose target from Dragon Roost"), "Dragon Roost");
  assert.equal(Board.nameFromLabel("Dragon Roost card preview"), "Dragon Roost");
  // The apostrophe case, which a narrower filter used to blank entirely.
  assert.equal(Board.nameFromLabel("Choose target from Targon's Peak"), "Targon's Peak");
  assert.equal(Board.nameFromLabel("Open token panel for Battlefield A."), null);
  assert.equal(Board.nameFromLabel(""), null);
});

test("an unnamed battlefield is null, not a guess", () => {
  fixture.build();
  for (const el of globalThis.document.querySelectorAll("[aria-label]")) {
    el.removeAttribute("aria-label");
  }
  assert.equal(Board.battlefieldName("battlefieldA"), null);
});

test("reads floating energy and power per side", () => {
  fixture.build();
  const r = Board.resources();
  assert.deepEqual(r.self, { energy: 2, power: 1 });
  assert.deepEqual(r.opponent, { energy: 0, power: 0 });
});

test("the readouts are attributed by ownership, not document order", () => {
  // Swapping which side comes first in the DOM must not swap the readings.
  fixture.build({ selfEnergy: 7, selfPower: 3, opponentEnergy: 1, opponentPower: 0 });
  const doc = globalThis.document;
  const sections = [...doc.querySelectorAll("section[data-zone-owner]")];
  sections[0].parentElement.insertBefore(sections[1], sections[0]);

  const r = Board.resources();
  assert.deepEqual(r.self, { energy: 7, power: 3 }, "still yours after the swap");
  assert.deepEqual(r.opponent, { energy: 1, power: 0 });
});

/* Deck piles, from the solo_lab capture (room QJJJ3). Neither pile is a drop
 * zone nor carries a data-card-id, so the zone read never reached them. */

test("reads the main deck and rune deck per side", () => {
  fixture.build();
  const d = Board.decks();
  assert.deepEqual(d.self, { main: 32, rune: 8 });
  assert.deepEqual(d.opponent, { main: 33, rune: 6 });
});

test("a card back with no count is not a deck pile", () => {
  fixture.build();
  // The fixture puts a loose card back on each side; four piles, not six.
  assert.equal(Board.deckPiles().length, 4);
});

test("the art tells the piles apart, not their sizes", () => {
  // A main deck thinned below the rune deck: magnitude would swap them.
  fixture.build({ selfDeck: 5, selfRunes: 9 });
  assert.deepEqual(
    Board.decks().self,
    { main: 5, rune: 9 },
    "a five-card deck is still the deck"
  );
});

test("falls back to size only when the art does not settle it", () => {
  fixture.build();
  for (const img of globalThis.document.querySelectorAll("img[data-rift-image-kind]")) {
    img.setAttribute("src", "https://x/riftbound/static/cardback-black.png");
  }
  const d = Board.decks();
  assert.deepEqual(d.self, { main: 32, rune: 8 }, "larger pile taken as the deck");
});

test("a side with no piles reads null, not zero", () => {
  fixture.build();
  for (const img of globalThis.document.querySelectorAll("img[data-rift-image-kind]")) {
    img.remove();
  }
  assert.deepEqual(Board.decks().self, { main: null, rune: null });
});
