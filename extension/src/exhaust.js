/* Exhausted / readied state — the one field we could not confirm off-site.
 *
 * Neither public extension reads it: the stats tracker never needed to know
 * whether a unit was exhausted, so its source says nothing about how the site
 * marks one. Rather than invent a selector and report confident nonsense, this
 * probe tries the markers such a board plausibly uses and answers `null` when
 * none of them is present.
 *
 * `null` means "could not read", not "readied". Callers must treat it as
 * unknown and say so, because a coach told a blocker is ready when it is
 * exhausted gives worse advice than one told nothing.
 *
 * To close this: run discovery.js on a live board with something exhausted and
 * read what actually changes. Then the guesses below become one real rule.
 */
(function (root) {
  "use strict";

  /* Ordered most to least likely. Each answers true, false, or null, and the
   * first non-null answer wins, so a board that marks exhaustion explicitly is
   * never second-guessed by a weaker signal further down. */
  const PROBES = [
    // An explicit attribute is what a board with this much data-* markup
    // would most likely use.
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
