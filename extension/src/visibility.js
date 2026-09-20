/* The hidden-information boundary.
 *
 * Reading the DOM already makes a leak hard: the client draws card backs for
 * anything the player may not see, so an opponent's hand arrives here as
 * anonymous elements with no code and no name. The base rule is therefore
 * short, and pretending it is longer would be theatre:
 *
 *   A card's identity is carried only when the client drew it face-up.
 *   How many cards sit in a zone is carried always.
 *
 * The count is deliberately public. You can see your opponent holding five,
 * and a coach that doesn't know it gives bad advice.
 *
 * What this file adds on top of that rule is a check the rule cannot make by
 * itself. Trusting the render means trusting that the render is correct, and
 * the one place that assumption could fail silently is an opponent's private
 * zone. So those zones are held to a stricter standard: a face-up card in an
 * opponent's hand is withheld and reported, rather than passed through.
 *
 * That costs a little. An opponent revealing a card from hand as a cost is
 * information you are entitled to, and it is dropped here. That is the trade
 * this project asked for — never surface hidden information, even when the
 * client transmits it — and it errs in the only direction worth erring in.
 */
(function (root) {
  "use strict";

  /* Zones where a face-up card is expected: it has been revealed to the table
   * and both players can see it. */
  const PUBLIC_ZONES = new Set([
    "base",
    "battlefieldA",
    "battlefieldB",
    "runeArea",
    "trash",
  ]);

  /* Zones that are private to their owner. A face-up card here, on the
   * opponent's side, is something the client should not have drawn for us. */
  const PRIVATE_ZONES = new Set(["hand"]);

  /** Is this card's identity ours to carry? */
  function mayReveal(side, zone, card) {
    if (card.faceDown) return false;
    if (side === "self") return true;
    // Opponent's side: face-up is fine in a zone the whole table can see,
    // and suspect in one only they should be able to.
    return !PRIVATE_ZONES.has(zone);
  }

  /* Why a card was withheld, or null when it wasn't. Distinguishing the two
   * reasons matters: `face-down` is the system working, `unexpected-face-up`
   * is the system telling us something we should look at. */
  function withholdReason(side, zone, card) {
    if (mayReveal(side, zone, card)) return null;
    if (card.faceDown) return "face-down";
    return "unexpected-face-up";
  }

  /* Filter one zone into the shape the snapshot carries.
   *
   * `hiddenCount` rather than a list of blanks: the count is the public fact,
   * and a list of placeholder objects invites a consumer to start treating
   * them as cards it knows something about.
   *
   * Withholding is reported as COUNTS, not as a message per card. A revealed
   * hand of six produced six identical lines every snapshot, several times a
   * turn, which buried the log it was meant to stand out in. What the message
   * should say also depends on the room mode, which this file has no business
   * knowing — so it counts, and snapshot.js does the wording. */
  function filterZone(side, zone, cards) {
    const visible = [];
    const withheld = { faceDown: 0, unexpectedFaceUp: 0 };

    for (const card of cards) {
      const reason = withholdReason(side, zone, card);
      if (reason === null) {
        visible.push(card);
        continue;
      }
      if (reason === "unexpected-face-up") withheld.unexpectedFaceUp += 1;
      else withheld.faceDown += 1;
    }

    const hiddenCount = withheld.faceDown + withheld.unexpectedFaceUp;
    return { count: cards.length, visible, hiddenCount, withheld };
  }

  /* A last check before a snapshot leaves the extension, run against the
   * assembled object rather than the zone lists it was built from. Returns the
   * offending paths; empty means clean.
   *
   * This should never fire. It exists because "should never fire" is exactly
   * the claim worth re-testing on every snapshot rather than trusting once. */
  function audit(snapshot) {
    const leaks = [];
    for (const [side, sideZones] of Object.entries(snapshot?.zones || {})) {
      for (const [zone, data] of Object.entries(sideZones || {})) {
        (data?.visible || []).forEach((card, i) => {
          const where = `${side}.${zone}.visible[${i}]`;
          if (card.faceDown) leaks.push(`${where}: face-down card marked visible`);
          if (!mayReveal(side, zone, card)) leaks.push(`${where}: not revealable`);
          if (card.faceDown && (card.code || card.name)) {
            leaks.push(`${where}: face-down card carries an identity`);
          }
        });
      }
    }
    return leaks;
  }

  root.RBCVisibility = {
    PUBLIC_ZONES,
    PRIVATE_ZONES,
    mayReveal,
    withholdReason,
    filterZone,
    audit,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof window !== "undefined" ? window : globalThis).RBCVisibility;
}
