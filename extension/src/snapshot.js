/* Assembles one structured snapshot of the game as this player may see it.
 *
 * Pure with respect to the DOM in the sense that matters: it reads through
 * board.js and never touches a node itself, so the shape of the snapshot and
 * the shape of the site are decoupled. When a restyle moves a selector, only
 * board.js changes.
 */
(function (root) {
  "use strict";

  const SCHEMA_VERSION = 1;

  /* Bumped whenever the reading changes. It rides along in every snapshot so
   * a capture can be told apart from one taken by an older copy still alive in
   * the page — several can be, and they are not distinguishable by eye. */
  const EXTRACTOR_VERSION = "0.5.1";

  function playerBlock(board, side) {
    /* A champion still in its Champion Zone is a card that can be played from
     * there (rule 108.3.d) — it is not just a label for who you are. Once
     * deployed the zone is empty, so its presence IS the availability. */
    const champion = root.RBCBoard.cardAt(side, "champion");

    /* The legend is a standing ability engine, not a nameplate. Legends can
     * carry passive, triggered and activated abilities (174.6-174.8), and
     * activating one usually costs exhausting it — so whether it is ready is
     * as much a resource as an untapped rune. Carried with its code so its
     * text can be looked up, and with its state so the coach knows whether
     * the ability is still available this turn. */
    const legend = root.RBCBoard.cardAt(side, "legend");

    return {
      name: root.RBCBoard.playerName(side),
      score: root.RBCBoard.score(board, side),
      legend: legend?.name ?? null,
      legendCard: legend
        ? { name: legend.name, code: legend.code, exhausted: legend.exhausted }
        : { name: null, code: null, exhausted: null },
      champion: champion?.name ?? null,
      championZone: champion
        ? { name: champion.name, code: champion.code, available: true }
        : { name: null, code: null, available: false },
    };
  }

  /* Room modes that reveal both hands by design. In Two-Sided Practice you
   * pilot both seats, so the client showing you their hand is the mode
   * working, not the client leaking. The cards are withheld either way; what
   * changes is whether the report should alarm anyone.
   *
   * Keeping the alarming wording for an expected condition is worse than not
   * warning at all: it teaches you to skim past the warnings that matter. */
  const REVEALS_BOTH_HANDS = new Set(["solo_lab"]);

  function withholdNote(side, zone, withheld, mode) {
    if (!withheld.unexpectedFaceUp) return null;
    const n = withheld.unexpectedFaceUp;
    const cards = `${n} face-up card${n === 1 ? "" : "s"}`;

    if (REVEALS_BOTH_HANDS.has(mode)) {
      return `${side}.${zone}: ${cards} withheld — expected in Two-Sided Practice, which shows both hands by design.`;
    }
    return `${side}.${zone}: ${cards} rendered in a private zone and withheld. Either an in-game reveal effect, or the client is sending more than it should.`;
  }

  function zoneBlocks(side, warnings, mode) {
    const out = {};
    for (const zone of root.RBCBoard.ZONES) {
      const cards = root.RBCBoard.zoneCards(side, zone);
      const filtered = root.RBCVisibility.filterZone(side, zone, cards);

      // One line per zone, whatever the number of cards behind it.
      const note = withholdNote(side, zone, filtered.withheld, mode);
      if (note) warnings.push(note);

      delete filtered.withheld; // the counts are already in hiddenCount
      out[zone] = filtered;
    }
    return out;
  }

  /* The battlefields in play, which are shared rather than owned: both sides
   * commit units to the same two places. Named separately from the zones
   * because the zone holds who is standing there and this holds where. */
  function battlefieldBlocks() {
    const out = {};
    for (const zone of ["battlefieldA", "battlefieldB"]) {
      out[zone] = { name: root.RBCBoard.battlefieldName(zone) };
    }
    return out;
  }

  /* Build a snapshot, or null when there is no board to read — the lobby, the
   * deck builder, any of the site's own pages. */
  function build(options) {
    const opts = options || {};
    const board = root.RBCBoard.gameRoot();
    if (!board) return null;

    const warnings = [];
    const mode = root.RBCBoard.mode(board);
    const zones = {};
    for (const side of root.RBCBoard.SIDES) {
      zones[side] = zoneBlocks(side, warnings, mode);
    }

    const active = root.RBCBoard.activeSide(board);

    // Exhaustion is the one field we could not confirm off-site. Say so in the
    // snapshot rather than letting a consumer read `null` as "readied".
    const allCards = Object.values(zones)
      .flatMap((sideZones) => Object.values(sideZones))
      .flatMap((z) => z.visible);
    const exhaustReadable = root.RBCExhaust.confirmed(allCards);
    if (allCards.length && !exhaustReadable) {
      warnings.push(
        "exhausted/readied state could not be read from any card on this " +
          "board; every `exhausted` field is null (unknown, not readied). " +
          "The board normally marks it with data-exhausted, so this means " +
          "the markup moved - run rbcDiscover() and check the card button."
      );
    }

    const unread = [];

    const bf = battlefieldBlocks();
    if (Object.values(bf).every((b) => b.name === null)) {
      unread.push("battlefields.name");
    }
    const res = root.RBCBoard.resources();
    if (res.self.energy === null && res.self.power === null) {
      unread.push("resources.self");
    }

    const decks = root.RBCBoard.decks();
    if (decks.opponent.main === null) unread.push("decks.opponent.main");

    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      extractorVersion: opts.extractorVersion || EXTRACTOR_VERSION,
      capturedAt: new Date(opts.now ?? Date.now()).toISOString(),
      sequence: root.RBCBoard.sequence(board),
      match: {
        roomCode: root.RBCBoard.roomCode(),
        phase: root.RBCBoard.phase(board),
        mode: root.RBCBoard.mode(board),
        turnNumber: root.RBCBoard.turnNumber(board),
        turnStep: root.RBCBoard.turnStep(),
        activeSide: active,
        activeSeat: root.RBCBoard.activeSeat(board),
        isMyTurn: active === null ? null : active === "self",
      },
      /* How the snapshot was obtained, rather than what it says. A consumer
       * that cares whether the state is current reads this. */
      connection: {
        state: root.RBCBoard.connectionState(),
        resetToken: root.RBCBoard.resetToken(board),
      },
      players: {
        self: playerBlock(board, "self"),
        opponent: playerBlock(board, "opponent"),
      },
      resources: root.RBCBoard.resources(),
      decks: root.RBCBoard.decks(),
      battlefields: battlefieldBlocks(),
      zones,
      log: root.RBCBoard.logEntries(opts.logLimit ?? 40),
      fieldsUnread: exhaustReadable ? unread : ["exhausted", ...unread],
      warnings,
    };

    const conn = snapshot.connection.state;
    if (conn && conn !== "open") {
      warnings.push(
        `the realtime connection is "${conn}", not "open" — this board may be ` +
          `stale and should not be treated as the current game state.`
      );
    }

    const leaks = root.RBCVisibility.audit(snapshot);
    if (leaks.length) {
      // Refuse to emit rather than emit something that failed its own check.
      return { error: "visibility audit failed", leaks, capturedAt: snapshot.capturedAt };
    }
    return snapshot;
  }

  /* Is a second player seated, or is this a goldfish?
   *
   * The board writes the literal string "unknown" into
   * data-opponent-player-id when nobody is across the table, so a plain
   * truthiness check reads an empty seat as a live opponent.
   * RBCBoard.playerId rejects the sentinel. */
  function hasLiveOpponent(board) {
    return root.RBCBoard.playerId(board, "opponent") !== null;
  }

  /* Room modes where both seats belong to the person playing.
   *
   *   single_player - Goldfish, no opponent at all
   *   solo_lab      - Two-Sided Practice: a real opponent id and a real
   *                   opposing board, both of them yours
   *
   * `solo_lab` seats an opponent, so an opponent-presence check alone reads
   * it as a live match and pauses. That is wrong: two-sided practice IS solo
   * practice, and it is where most of this tool's value is. The mode is what
   * distinguishes it from `multiplayer`. */
  const SOLO_MODES = new Set(["single_player", "solo_lab"]);

  /* May the coaching pipeline run on this board?
   *
   * Yes when both seats are the player's own, or when nobody is across the
   * table. No in a real match against another person: live advice there is
   * assistance they do not have and did not agree to.
   *
   * An unrecognised mode with an opponent seated is refused rather than
   * allowed. A new mode name should cost a pause and a question, not a
   * silent coaching session in somebody else's game. */
  function isSoloPractice(board) {
    const mode = root.RBCBoard.mode(board);
    if (mode && SOLO_MODES.has(mode)) return true;
    return !hasLiveOpponent(board);
  }

  root.RBCSnapshot = {
    SCHEMA_VERSION,
    EXTRACTOR_VERSION,
    REVEALS_BOTH_HANDS,
    withholdNote,
    SOLO_MODES,
    build,
    hasLiveOpponent,
    isSoloPractice,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof window !== "undefined" ? window : globalThis).RBCSnapshot;
}
