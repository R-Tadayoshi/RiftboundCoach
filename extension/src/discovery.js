/* Attribute-surface dump, for closing the gaps we could not close off-site.
 *
 * Three things are still unknown because no public source reads them and the
 * site could not be reached from where this was written: how exhaustion is
 * marked, where a unit's might/power lives, and how energy and rune
 * availability are represented.
 *
 * Rather than guess, this reports what a live board actually carries. Run it
 * from the page console with something exhausted on the table and the output
 * says which attribute changed.
 *
 * Reads only. Emits attribute NAMES and the values of `data-*` attributes on
 * card elements — not card identities, so a dump is safe to paste into a chat
 * without handing over anyone's hand.
 */
(function (root) {
  "use strict";

  const SAFE_VALUE_RE = /^[A-Za-z0-9 _:.-]{0,40}$/;

  function describe(el) {
    const attrs = {};
    for (const { name, value } of el.attributes || []) {
      if (name === "alt" || name === "src" || name === "srcset") continue;
      // Card codes and names are not what this is for.
      attrs[name] = SAFE_VALUE_RE.test(value) ? value : "<omitted>";
    }
    const cls = typeof el.className === "string" ? el.className : "";
    return {
      tag: el.tagName?.toLowerCase(),
      attrs,
      classTokens: cls.split(/\s+/).filter(Boolean).slice(0, 30),
    };
  }

  /** Every distinct attribute name seen on card elements, with sample values. */
  function cardAttributeSurface() {
    const seen = new Map();
    for (const el of root.document.querySelectorAll("[data-card-id]")) {
      for (const { name, value } of el.attributes || []) {
        if (!seen.has(name)) seen.set(name, new Set());
        const samples = seen.get(name);
        if (samples.size < 6 && SAFE_VALUE_RE.test(value)) samples.add(value);
      }
    }
    return [...seen.entries()]
      .map(([name, samples]) => ({ name, samples: [...samples] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The board root's own attributes — the match-level fields. */
  function boardSurface() {
    const board = root.RBCBoard.gameRoot();
    return board ? describe(board) : null;
  }

  /* Full description of the first N cards in one zone. Call this twice — once
   * with a unit readied, once exhausted — and diff the output. */
  function sampleZone(side, zone, limit) {
    const out = [];
    const roots = root.document.querySelectorAll(
      `[data-drop-zone-root="${zone}"][data-zone-owner="${side}"]`
    );
    for (const zoneRoot of roots) {
      for (const el of zoneRoot.querySelectorAll("[data-card-id]")) {
        out.push(describe(el));
        if (out.length >= (limit ?? 4)) return out;
      }
    }
    return out;
  }

  /* The battlefield card itself — "Targon's Peak", "Dragon Roost" — is drawn
   * in the battlefield area but is not inside the zone root, so the zone read
   * finds the units standing there and not the place they are standing. This
   * walks up from the battlefield marker and describes what shares its
   * container, which is where that card has to be. */
  function battlefieldArea() {
    const out = [];
    for (const marker of root.document.querySelectorAll("[data-battlefield-marker]")) {
      const which = marker.getAttribute("data-battlefield-marker");
      const container = marker.closest("[data-drop-zone-root]") || marker.parentElement;
      const siblings = [];
      for (const el of (container?.querySelectorAll("*") || [])) {
        // Only elements that look like they could name the battlefield.
        const hasText = (el.textContent || "").trim().length > 0;
        const isLeafish = el.children.length <= 2;
        if (!hasText || !isLeafish) continue;
        const described = describe(el);
        described.text = (el.textContent || "").trim().slice(0, 60);
        siblings.push(described);
        if (siblings.length >= 8) break;
      }
      out.push({ which, containerTag: container?.tagName?.toLowerCase(), siblings });
    }
    return out;
  }

  /* The "FLOATING — Energy / Power" readout, and the deck counts. Located by
   * the words beside them, since no attribute for either has turned up. */
  function resourceReadouts() {
    const hits = [];
    for (const el of root.document.querySelectorAll("*")) {
      if (el.children.length > 3) continue;
      const text = (el.textContent || "").trim();
      if (!/^(floating|energy|power)\b/i.test(text) || text.length > 40) continue;
      const described = describe(el);
      described.text = text.slice(0, 60);
      described.parentAttrs = el.parentElement
        ? describe(el.parentElement).attrs
        : null;
      hits.push(described);
      if (hits.length >= 10) break;
    }
    return hits;
  }

  /** Everything at once, ready to paste. */
  function report() {
    return {
      board: boardSurface(),
      cardAttributes: cardAttributeSurface(),
      selfBattlefieldA: sampleZone("self", "battlefieldA", 3),
      selfBase: sampleZone("self", "base", 3),
      selfRunes: sampleZone("self", "runeArea", 3),
      battlefieldArea: battlefieldArea(),
      resourceReadouts: resourceReadouts(),
      zonesPresent: [
        ...new Set(
          [...root.document.querySelectorAll("[data-drop-zone-root]")].map((el) =>
            el.getAttribute("data-drop-zone-root")
          )
        ),
      ],
    };
  }

  root.RBCDiscovery = {
    describe,
    cardAttributeSurface,
    boardSurface,
    sampleZone,
    battlefieldArea,
    resourceReadouts,
    report,
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof window !== "undefined" ? window : globalThis).RBCDiscovery;
}
