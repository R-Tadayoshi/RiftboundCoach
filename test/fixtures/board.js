/* A synthetic Rift Atlas board, built to the markup documented in
 * docs/phase1-recon.md. Not a recording of the live site — it is the shape the
 * two public extensions read, reproduced so the extractor can be tested
 * without the site. Anything it asserts about markup is only as good as that
 * documentation, which is why docs/state-schema.md lists what still needs
 * confirming against a real board.
 */
"use strict";

const { JSDOM } = require("jsdom");

// The real shape, read out of the site's own bundle: a flat <CODE>.webp under
// /riftbound/cards, optionally behind a size variant ("small-v2", "original").
const ART = (code) =>
  `https://assets.riftatlas-workers.com/riftbound/cards/small-v2/${code}.webp`;
const CARD_BACK = "https://assets.riftatlas-workers.com/riftbound/static/cardback-blue.png";

/* One card, as the live board actually nests it: a hover-preview anchor and
 * the drawn card button BOTH carry the same data-card-id, and hand adds a
 * third wrapper. Reproducing that is the point — reading every [data-card-id]
 * counted one card two or three times, and a fixture with one element per card
 * could never have caught it.
 *
 * The button is the element carrying data-exhausted and data-face-down. */
function cardHtml(card, zone, index) {
  const faceDown = !!card.faceDown;
  const img = faceDown
    ? `<img alt="Hidden card" src="${CARD_BACK}">`
    : `<img alt="${card.name}" src="${ART(card.code)}">`;
  // Cards in hand cannot be exhausted, so the board omits the attribute.
  const exhausted =
    zone === "hand" || card.exhausted === undefined
      ? ""
      : ` data-exhausted="${card.exhausted}"`;
  const outerWrapper =
    zone === "hand"
      ? `<div data-card-id="${card.id}" data-drop-zone="${zone}">`
      : "";
  const closeOuter = zone === "hand" ? "</div>" : "";

  return `${outerWrapper}
    <div class="relative w-full h-full" data-hover-preview-anchor="true"
         data-card-id="${card.id}" data-drop-zone="${zone}">
      <button type="button" data-card-id="${card.id}" data-drop-zone="${zone}"
              data-drop-index="${index}" data-board-card-visual="true"
              data-visual-owner="self"${exhausted}
              data-face-down="${faceDown}"${card.attrs || ""}>
        ${img}
      </button>
    </div>${closeOuter}`;
}

/* Zone furniture that carries a data-card-id without being a card. Counting
 * one as a face-down card is how an empty base reported a hidden card. */
function markerHtml(zone, owner) {
  const id =
    zone === "base" ? `base-area-marker:${owner}` : `battlefield-marker:${zone}`;
  return `<div data-card-id="${id}" data-drop-zone="${zone}"
               role="img" aria-label="Your base area"></div>`;
}

function zoneHtml(side, zone, cards) {
  const marker =
    zone === "base" || zone === "battlefieldA" || zone === "battlefieldB"
      ? markerHtml(zone, side === "self" ? "plr_self" : "plr_opp")
      : "";
  return `<div data-drop-zone-root="${zone}" data-zone-owner="${side}">
    ${marker}
    ${cards.map((c, i) => cardHtml(c, zone, i)).join("\n")}
  </div>`;
}

function logHtml(entries) {
  const bar = (actor) =>
    actor === "self"
      ? 'bg-[rgb(120,221,183)]'
      : actor === "opponent"
      ? 'bg-[rgb(255,187,110)]'
      : 'bg-[rgb(140,140,140)]';
  // The panel renders newest-first.
  return `<ul>${[...entries]
    .reverse()
    .map(
      (e) => `<li>
        <span aria-hidden="true" class="${bar(e.actor)}"></span>
        <p><span><span>${e.at}</span><span>${e.text}</span></span></p>
      </li>`
    )
    .join("\n")}</ul>`;
}

const DEFAULTS = {
  phase: "in_game",
  mode: "constructed",
  turnNumber: 7,
  turnStep: "action",
  sequence: "412",
  resetToken: "rt-1",
  activeSeat: "seat-a",
  connectionState: "open",
  roomCode: "QWLM",
  viewerId: "p-self",
  opponentId: "p-opp",
  activeId: "p-self",
  selfScore: 3,
  opponentScore: 5,
  selfName: "curtyo",
  opponentName: "rival",
  selfLegend: "Yasuo, the Unforgiven",
  selfChampion: "Yasuo",
  opponentLegend: "Lux, the Lady of Luminosity",
  opponentChampion: "Lux",
  zones: {
    self: {
      hand: [
        { id: "s-h1", code: "OGN-004", name: "Sweeping Blade" },
        { id: "s-h2", code: "OGN-017", name: "Windwall" },
      ],
      base: [{ id: "s-b1", code: "OGN-031", name: "Steadfast Guard", exhausted: false }],
      battlefieldA: [{ id: "s-fa1", code: "OGN-052", name: "Ionian Duelist", exhausted: true }],
      battlefieldB: [],
      runeArea: [
        { id: "s-r1", code: "OGN-201", name: "Fury Rune", exhausted: true },
        { id: "s-r2", faceDown: true, exhausted: false },
      ],
      trash: [{ id: "s-t1", code: "OGN-077", name: "Last Breath" }],
    },
    opponent: {
      // Four cards in hand, all card backs — what the client actually draws.
      hand: [
        { id: "o-h1", faceDown: true },
        { id: "o-h2", faceDown: true },
        { id: "o-h3", faceDown: true },
        { id: "o-h4", faceDown: true },
      ],
      base: [{ id: "o-b1", code: "OGN-110", name: "Luminous Acolyte" }],
      battlefieldA: [{ id: "o-fa1", code: "OGN-121", name: "Radiant Sentry" }],
      battlefieldB: [],
      runeArea: [{ id: "o-r1", code: "OGN-210", name: "Order Rune" }],
      trash: [],
    },
  },
  log: [
    { at: "16:09", actor: "system", text: "Turn 7 begins." },
    { at: "16:10", actor: "self", text: "Played Ionian Duelist." },
    { at: "16:11", actor: "opponent", text: "Conquered Ironspire and scored 1." },
  ],
};

/** Build a DOM and install it as the global document the modules read. */
function build(overrides) {
  const o = { ...DEFAULTS, ...(overrides || {}) };
  const zones = overrides?.zones
    ? { self: { ...DEFAULTS.zones.self, ...(overrides.zones.self || {}) },
        opponent: { ...DEFAULTS.zones.opponent, ...(overrides.zones.opponent || {}) } }
    : DEFAULTS.zones;

  const sideHtml = (side) => `
    <section data-zone-owner="${side}">
      <div data-drop-zone="legend"><img alt="${side === "self" ? o.selfLegend : o.opponentLegend}" src="${ART("OGN-001")}"></div>
      <div data-drop-zone="champion"><img alt="${side === "self" ? o.selfChampion : o.opponentChampion}" src="${ART("OGN-002")}"></div>
      ${Object.entries(zones[side]).map(([zone, cards]) => zoneHtml(side, zone, cards)).join("\n")}
    </section>`;

  const html = `<!doctype html><html><body>
    <div data-testid="game-state"
         data-room-phase="${o.phase}"
         data-room-mode="${o.mode}"
         data-turn-number="${o.turnNumber}"
         data-authoritative-sequence="${o.sequence}"
         data-authoritative-reset-token="${o.resetToken}"
         data-active-player-seat="${o.activeSeat}"
         data-viewer-player-id="${o.viewerId}"
         data-opponent-player-id="${o.opponentId}"
         data-active-player-id="${o.activeId}"
         data-viewer-score="${o.selfScore}"
         data-opponent-score="${o.opponentScore}">
      <div data-testid="room-code" data-room-code="${o.roomCode}"></div>
      <span data-testid="turn-step" data-turn-step="${o.turnStep}">${o.turnStep}</span>
      <div data-testid="realtime-status" data-status="${o.connectionState}"></div>
      <button data-player-identity-trigger="player" aria-label="${o.selfName} profile and actions"></button>
      <button data-player-identity-trigger="opponent" aria-label="${o.opponentName} profile and actions"></button>
      ${sideHtml("self")}
      ${sideHtml("opponent")}
      ${logHtml(o.log)}
    </div>
  </body></html>`;

  const dom = new JSDOM(html);
  globalThis.document = dom.window.document;
  return dom;
}

/** A page with no board at all — the lobby, the deck builder. */
function buildEmpty() {
  const dom = new JSDOM(`<!doctype html><html><body><main>lobby</main></body></html>`);
  globalThis.document = dom.window.document;
  return dom;
}

/* A goldfish: the board stamps the string "unknown" into every field it
 * cannot fill, rather than leaving the attribute off. */
function buildGoldfish() {
  return build({
    opponentId: "unknown",
    activeId: "unknown",
    opponentScore: "unknown",
    turnNumber: "unknown",
  });
}

module.exports = { build, buildEmpty, buildGoldfish, DEFAULTS, ART, CARD_BACK };
