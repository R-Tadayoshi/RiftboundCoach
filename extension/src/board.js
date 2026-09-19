/* Reading layer: every DOM read lives here, and nothing else touches the DOM.
 *
 * Selectors are taken from the markup two public read-only extensions already
 * depend on (see docs/phase1-recon.md). Only `data-*` attributes and ARIA
 * labels are used: this site's class names are generated utilities with colour
 * values baked in and are rewritten on every restyle.
 *
 * Every reader answers null when the board is not saying, never a default. An
 * unreadable score is not zero and a missing name is not an empty name, so the
 * callers can tell "no reading" from "read a zero" and keep what they had.
 */
(function (root) {
  "use strict";

  const SEL = {
    root: '[data-testid="game-state"]',
    roomCode: '[data-testid="room-code"]',
    scoreGroup: {
      self: '[role="group"][aria-label="Your score track"]',
      opponent: '[role="group"][aria-label="Opponent score track"]',
    },
    // Zone ownership and player badges disagree on what to call you:
    // data-zone-owner says "self", data-player-identity-trigger says "player".
    badge: {
      self: '[data-player-identity-trigger="player"]',
      opponent: '[data-player-identity-trigger="opponent"]',
    },
  };

  /** Zones that hold cards. Order is display order, not importance. */
  const ZONES = [
    "hand",
    "base",
    "battlefieldA",
    "battlefieldB",
    "runeArea",
    "trash",
  ];

  const SIDES = ["self", "opponent"];

  /* A face-down card. The client draws card backs rather than shipping the
   * identity to the renderer, which is why reading the DOM cannot surface an
   * opponent's hand however hard it tries. */
  const FACE_DOWN_RE = /hidden card|card back|rune back/i;

  /* Card art is served from assets.riftatlas-workers.com/riftbound/cards as
   * <CODE>.webp, optionally behind a size-variant segment ("small-v2",
   * "original"). Both shapes are accepted; tokens and UI art live elsewhere
   * and yield no code, which is right — they were never cards in a deck. */
  const CODE_RE = /\/cards\/(?:[a-z0-9-]+\/)?([A-Za-z]{2,4}-\d{1,4})\.webp/i;

  /* The card-back art, as a second opinion on face-down alongside alt text. */
  const CARD_BACK_SRC_RE = /cardback[a-z-]*\.(?:png|webp|jpg)/i;

  // Match-log rows carry a coloured bar naming who acted.
  const ACTOR_SELF = "120,221,183"; // green
  const ACTOR_OPPONENT = "255,187,110"; // amber

  const doc = () => root.document;

  /** The board root, or null on any of the site's non-game pages. */
  function gameRoot() {
    return doc().querySelector(SEL.root);
  }

  /* The board fills an attribute it cannot answer with the literal string
   * "unknown" rather than leaving it off, so every read has to reject it. A
   * missed one is not a missing value but a confident wrong one: `"unknown"`
   * is a non-empty string, and reads as a seated opponent, a live player id,
   * a real room code. */
  const UNKNOWN = "unknown";

  function strAttr(el, key) {
    const v = el?.dataset?.[key];
    return typeof v === "string" && v !== "" && v !== UNKNOWN ? v : null;
  }

  function intAttr(board, key) {
    const raw = strAttr(board, key);
    const n = parseInt(raw ?? "", 10);
    return Number.isFinite(n) ? n : null;
  }

  const phase = (board) => strAttr(board, "roomPhase");
  const mode = (board) => strAttr(board, "roomMode");
  const turnNumber = (board) => intAttr(board, "turnNumber");

  /* Which step of the turn we are in. Rendered on its own element rather than
   * the board root. */
  const turnStep = () =>
    strAttr(doc().querySelector('[data-testid="turn-step"]'), "turnStep");

  /* The realtime socket's state: idle | connecting | open | closed | error.
   * A snapshot taken while this is not "open" may be stale. */
  const connectionState = () =>
    strAttr(doc().querySelector('[data-testid="realtime-status"]'), "status");

  /* Bumps when the server replaces authoritative state wholesale. A change
   * means the previous snapshot's sequence numbers no longer compare. */
  const resetToken = (board) => strAttr(board, "authoritativeResetToken");

  const activeSeat = (board) => strAttr(board, "activePlayerSeat");

  /* Bumps once per authoritative game action. It is the change trigger the
   * whole extractor runs on: one snapshot per real event, no polling. */
  const sequence = (board) => strAttr(board, "authoritativeSequence");

  const roomCode = () => strAttr(doc().querySelector(SEL.roomCode), "roomCode");

  /** The id naming one side, or null when the board says "unknown". */
  const playerId = (board, side) =>
    strAttr(board, side === "self" ? "viewerPlayerId" : "opponentPlayerId");

  /** "self", "opponent", or null when the board names nobody we know. */
  function activeSide(board) {
    const active = strAttr(board, "activePlayerId");
    if (!active) return null;
    if (active === playerId(board, "self")) return "self";
    if (active === playerId(board, "opponent")) return "opponent";
    return null;
  }

  /* Scores come off the board root, beside the sequence the server stamps
   * there, so both sides read the same way. The tracks are the fallback and
   * hold no number: each node puts its value in an aria-label alone
   * ("Set your score to 4"). */
  const NODE_VALUE_RE = /(\d+)\s*$/;

  function trackScore(side) {
    const group = doc().querySelector(SEL.scoreGroup[side]);
    if (!group) return null;
    const current =
      group.querySelector('[data-active="true"]') ||
      group.querySelector('[aria-pressed="true"]');
    const hit = NODE_VALUE_RE.exec(current?.getAttribute("aria-label") ?? "");
    const n = hit ? parseInt(hit[1], 10) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  function score(board, side) {
    const key = side === "self" ? "viewerScore" : "opponentScore";
    const fromRoot = intAttr(board, key);
    return fromRoot === null ? trackScore(side) : fromRoot;
  }

  const MENU_SUFFIX_RE = /\s*menu$/i;

  function playerName(side) {
    const label = doc()
      .querySelector(SEL.badge[side])
      ?.getAttribute("aria-label");
    const name = (label || "").replace(MENU_SUFFIX_RE, "").trim();
    return name || null;
  }

  /** Legend or champion art for one side, by its alt text. Null when hidden. */
  function cardAlt(side, dropZone) {
    for (const owner of doc().querySelectorAll(`[data-zone-owner="${side}"]`)) {
      const img = owner.querySelector(`[data-drop-zone="${dropZone}"] img[alt]`);
      if (img?.alt && !FACE_DOWN_RE.test(img.alt)) return img.alt;
    }
    return null;
  }

  const codeFromSrc = (src) => {
    const hit = CODE_RE.exec(src || "");
    return hit ? hit[1] : null;
  };

  /* Every card element in one side's zone, face-up and face-down alike.
   *
   * Face-down cards are returned rather than dropped, carrying no identity.
   * How many cards sit in a zone is public — you can see your opponent holding
   * five — and the coach needs it. What those cards ARE is not, and is not
   * here to be leaked: `code` and `name` stay null. The split is enforced
   * again in visibility.js rather than trusted to this one place. */
  function zoneCards(side, zone) {
    const out = [];
    let roots;
    try {
      roots = doc().querySelectorAll(
        `[data-drop-zone-root="${zone}"][data-zone-owner="${side}"]`
      );
    } catch (_) {
      return out;
    }
    for (const zoneRoot of roots) {
      for (const el of zoneRoot.querySelectorAll("[data-card-id]")) {
        const img = el.querySelector("img[alt]");
        const alt = img?.alt || "";
        const src = img ? img.currentSrc || img.src || "" : "";
        // Either signal is enough: the alt text is localised and the art path
        // is not, so neither is trustworthy alone.
        const faceDown =
          !img || FACE_DOWN_RE.test(alt) || CARD_BACK_SRC_RE.test(src);
        out.push({
          cardId: el.getAttribute("data-card-id") || null,
          faceDown,
          code: faceDown ? null : codeFromSrc(src),
          name: faceDown ? null : alt || null,
          exhausted: root.RBCExhaust.read(el),
        });
      }
    }
    return out;
  }

  /* Log rows: <li><span aria-hidden [actor colour]></span><p>…<span>16:11</span>
   * <span>Conquered X and scored 1.</span>…</p></li>, newest first. */
  function parseLogRow(li) {
    const p = li.querySelector("p");
    if (!p) return null;
    const spans = [...p.querySelectorAll("span")];
    const timeIdx = spans.findIndex((s) =>
      /^\d{1,2}:\d{2}$/.test((s.textContent || "").trim())
    );
    if (timeIdx < 0) return null;
    const at = spans[timeIdx].textContent.trim();
    const holder = spans[timeIdx].parentElement || p;
    const text = (holder.textContent || "").trim().replace(at, "").trim();
    if (!text) return null;
    const bar = li.querySelector('span[aria-hidden="true"]');
    const cls = (bar && bar.className) || "";
    const actor = cls.includes(ACTOR_SELF)
      ? "self"
      : cls.includes(ACTOR_OPPONENT)
      ? "opponent"
      : "system";
    return { at, actor, text };
  }

  /** The log oldest-first, or an empty array when there is nothing to read. */
  function logEntries(limit) {
    let rows;
    try {
      rows = doc().querySelectorAll("ul li");
    } catch (_) {
      return [];
    }
    const entries = [];
    for (const li of rows) {
      const entry = parseLogRow(li);
      if (entry) entries.push(entry);
    }
    entries.reverse(); // the panel renders newest-first
    return typeof limit === "number" ? entries.slice(-limit) : entries;
  }

  root.RBCBoard = {
    SEL,
    ZONES,
    SIDES,
    FACE_DOWN_RE,
    CARD_BACK_SRC_RE,
    UNKNOWN,
    strAttr,
    gameRoot,
    phase,
    mode,
    turnNumber,
    turnStep,
    connectionState,
    resetToken,
    activeSeat,
    sequence,
    roomCode,
    playerId,
    activeSide,
    score,
    playerName,
    cardAlt,
    codeFromSrc,
    zoneCards,
    parseLogRow,
    logEntries,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof window !== "undefined" ? window : globalThis).RBCBoard;
}
