/* Exhausted / readied state.
 *
 * The board marks it with `data-exhausted="true"|"false"` on the card button —
 * confirmed against a live goldfish board, where the runes spent that turn
 * read true and an untapped unit read false. That is the real rule; the rest
 * below are kept only as fallbacks against a future restyle.
 *
 * `null` still means "could not read", never "readied". Two cases produce it
 * legitimately: a card in hand, which carries no exhaustion because it cannot
 * have any, and an element that is not the card button. Callers must not read
 * null as ready — a coach told a blocker is available when it is exhausted
 * gives worse advice than one told nothing.
 */
(function (root) {
  "use strict";

  /* Ordered most to least likely. Each answers true, false, or null, and the
   * first non-null answer wins, so the confirmed attribute is never
   * second-guessed by a weaker signal further down. */
  const PROBES = [
    // data-exhausted is the live board's own marker. The other two names are
    // speculative siblings, kept cheap in case it is ever renamed.
    function attr(el) {
      for (const name of ["data-exhausted", "data-is-exhausted", "data-tapped"]) {
        const v = el.getAttribute(name);
        if (v === null) continue;
        return v !== "false" && v !== "0";
      }
      return null;
    },
    // A state enum, as shadcn/Radix-style components carry.
    function stateEnum(el) {
      const v = el.getAttribute("data-state") || el.getAttribute("data-card-state");
      if (!v) return null;
      if (/exhaust|tapped/i.test(v)) return true;
      if (/ready|readied|untapped/i.test(v)) return false;
      return null;
    },
    // Exhaustion is drawn as a rotation in every tabletop client that has one.
    // Weakest signal here and deliberately last: a class name on this site is
    // rewritten on every restyle.
    function rotation(el) {
      const cls = typeof el.className === "string" ? el.className : "";
      if (/\brotate-90\b|\bexhausted\b/.test(cls)) return true;
      return null;
    },
  ];

  /** true, false, or null when the board does not say. */
  function read(el) {
    if (!el || typeof el.getAttribute !== "function") return null;
    for (const probe of PROBES) {
      let answer = null;
      try {
        answer = probe(el);
      } catch (_) {
        answer = null;
      }
      if (answer !== null) return answer;
    }
    return null;
  }

  /** Whether any probe found a marker anywhere — used to warn once per match. */
  function confirmed(cards) {
    return cards.some((c) => c.exhausted !== null);
  }

  root.RBCExhaust = { read, confirmed, PROBES };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof window !== "undefined" ? window : globalThis).RBCExhaust;
}
