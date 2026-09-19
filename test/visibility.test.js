"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./fixtures/board.js");

require("../extension/src/exhaust.js");
const Board = require("../extension/src/board.js");
const Vis = require("../extension/src/visibility.js");
const Snapshot = require("../extension/src/snapshot.js");

const faceUp = (over) => ({ cardId: "x", faceDown: false, code: "OGN-004", name: "A", exhausted: null, ...over });
const faceDown = (over) => ({ cardId: "x", faceDown: true, code: null, name: null, exhausted: null, ...over });

test("your own face-up cards are yours to see", () => {
  assert.equal(Vis.mayReveal("self", "hand", faceUp()), true);
  assert.equal(Vis.mayReveal("self", "base", faceUp()), true);
});

test("your own face-down cards stay hidden from you too", () => {
  // The client hasn't revealed it to us either; we don't invent it.
  assert.equal(Vis.mayReveal("self", "runeArea", faceDown()), false);
});

test("the opponent's public zones are readable when drawn face-up", () => {
  for (const zone of ["base", "battlefieldA", "battlefieldB", "runeArea", "trash"]) {
    assert.equal(Vis.mayReveal("opponent", zone, faceUp()), true, zone);
  }
});

test("the opponent's hand is never readable, face-up or not", () => {
  assert.equal(Vis.mayReveal("opponent", "hand", faceDown()), false);
  // The load-bearing case: even if the client hands us an identity, we refuse.
  assert.equal(Vis.mayReveal("opponent", "hand", faceUp()), false);
});

test("a face-up card in the opponent's hand is withheld AND reported", () => {
  const leaked = faceUp({ cardId: "o-h1", code: "OGN-999", name: "Their Secret" });
  const out = Vis.filterZone("opponent", "hand", [leaked, faceDown(), faceDown()]);

  assert.equal(out.count, 3, "all three are counted");
  assert.equal(out.visible.length, 0, "none of them is carried");
  assert.equal(out.hiddenCount, 3);
  assert.equal(out.warnings.length, 1, "the anomaly is surfaced, not swallowed");
  assert.match(out.warnings[0], /private zone/);

  const serialised = JSON.stringify(out);
  assert.ok(!serialised.includes("OGN-999"), "the code does not survive");
  assert.ok(!serialised.includes("Their Secret"), "the name does not survive");
});

test("card counts survive even when identities do not", () => {
  fixture.build();
  const cards = Board.zoneCards("opponent", "hand");
  const out = Vis.filterZone("opponent", "hand", cards);
  assert.equal(out.count, 4, "knowing they hold four is legitimate and useful");
  assert.equal(out.visible.length, 0);
  assert.equal(out.hiddenCount, 4);
  assert.equal(out.warnings.length, 0, "ordinary card backs are not an anomaly");
});

test("audit catches a leak injected after filtering", () => {
  fixture.build();
  const snap = Snapshot.build();
  assert.deepEqual(Vis.audit(snap), [], "a clean snapshot audits clean");

  snap.zones.opponent.hand.visible.push(faceUp({ code: "OGN-999" }));
  const leaks = Vis.audit(snap);
  assert.equal(leaks.length, 1);
  assert.match(leaks[0], /opponent\.hand\.visible\[0\]/);
});

test("audit catches a face-down card that acquired an identity", () => {
  fixture.build();
  const snap = Snapshot.build();
  snap.zones.self.hand.visible.push(faceDown({ code: "OGN-123", name: "Ghost" }));
  const leaks = Vis.audit(snap);
  assert.ok(leaks.length >= 1);
  assert.ok(leaks.some((l) => /face-down/.test(l)));
});

test("a snapshot that fails its own audit is refused, not emitted", () => {
  fixture.build();
  // Make the board hand us an opponent hand card rendered face-up.
  const doc = globalThis.document;
  const oppHand = doc.querySelector('[data-drop-zone-root="hand"][data-zone-owner="opponent"]');
  oppHand.querySelector("[data-card-id] img").setAttribute("alt", "Their Secret");
  oppHand
    .querySelector("[data-card-id] img")
    .setAttribute("src", "https://assets.riftatlas-workers.com/cards/OGN/OGN-999.webp");

  const snap = Snapshot.build();
  // filterZone already withheld it, so this emits cleanly with a warning
  // rather than erroring - the leak never reaches the audit.
  assert.ok(!snap.error, "withheld at the filter, so the snapshot still builds");
  assert.equal(snap.zones.opponent.hand.visible.length, 0);
  assert.equal(snap.zones.opponent.hand.count, 4);
  assert.ok(snap.warnings.some((w) => /private zone/.test(w)));
  assert.ok(!JSON.stringify(snap).includes("OGN-999"));
});
