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

  function playerBlock(board, side) {
    return {
      name: root.RBCBoard.playerName(side),
      score: root.RBCBoard.score(board, side),
      legend: root.RBCBoard.cardAlt(side, "legend"),
      champion: root.RBCBoard.cardAlt(side, "champion"),
    };
  }

  function zoneBlocks(side, warnings) {
    const out = {};
    for (const zone of root.RBCBoard.ZONES) {
      const cards = root.RBCBoard.zoneCards(side, zone);
      const filtered = root.RBCVisibility.filterZone(side, zone, cards);
      warnings.push(...filtered.warnings);
      delete filtered.warnings; // collected at the top level instead
      out[zone] = filtered;
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
    const zones = {};
    for (const side of root.RBCBoard.SIDES) {
      zones[side] = zoneBlocks(side, warnings);
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

    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
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
      zones,
      log: root.RBCBoard.logEntries(opts.logLimit ?? 40),
      fieldsUnread: exhaustReadable ? [] : ["exhausted"],
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
   * truthiness check reads an empty seat as a live opponent — which would
   * pause capture during exactly the solo practice this is built for.
   * RBCBoard.playerId rejects the sentinel. */
  function hasLiveOpponent(board) {
    return root.RBCBoard.playerId(board, "opponent") !== null;
  }

  root.RBCSnapshot = { SCHEMA_VERSION, build, hasLiveOpponent };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof window !== "undefined" ? window : globalThis).RBCSnapshot;
}
