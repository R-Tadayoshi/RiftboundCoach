/* Wiring: watch the board, build a snapshot per authoritative action, hand it
 * to the local sidecar.
 *
 * Passive throughout. Nothing here clicks, drags, or writes to the page — it
 * reads the board the same way a screenshot would, and the only thing it
 * changes is a small status line of its own.
 */
(function (root) {
  "use strict";

  const SIDECAR = "http://127.0.0.1:8787";

  const CONFIG = {
    /* Capture only when no second player is seated.
     *
     * The extractor is for solo practice. Live advice in a real match is
     * assistance the other player doesn't have and didn't agree to, and Rift
     * Atlas's terms ask users not to interfere with other users. Enforcing it
     * here means no downstream consumer can quietly opt out of it.
     *
     * Flip it knowing exactly what you are flipping. */
    soloOnly: true,
    /* How long the board must sit still before it is read. A drag, an
     * animation and a re-render all settle well inside this. */
    settleMs: 250,
    logLimit: 40,
  };

  let lastSequence = null;
  let settleTimer = null;
  let lastStatus = "";

  function status(text) {
    if (text === lastStatus) return;
    lastStatus = text;
    let el = root.document.getElementById("rbc-status");
    if (!el) {
      el = root.document.createElement("div");
      el.id = "rbc-status";
      el.setAttribute("aria-live", "polite");
      root.document.body.appendChild(el);
    }
    el.textContent = `coach: ${text}`;
  }

  async function send(snapshot) {
    try {
      await fetch(`${SIDECAR}/state`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(snapshot),
        credentials: "omit",
      });
      return true;
    } catch (_) {
      // The sidecar not running is the ordinary case, not an error worth
      // shouting about — the user starts it when they want to capture.
      return false;
    }
  }

  function capture() {
    const board = root.RBCBoard.gameRoot();
    if (!board) {
      status("no board");
      return;
    }

    if (CONFIG.soloOnly && root.RBCSnapshot.hasLiveOpponent(board)) {
      status("paused — a second player is seated (solo-only)");
      return;
    }

    const seq = root.RBCBoard.sequence(board);
    if (seq !== null && seq === lastSequence) return; // nothing authoritative changed

    const snapshot = root.RBCSnapshot.build({ logLimit: CONFIG.logLimit });
    if (!snapshot) return;

    if (snapshot.error) {
      status(`withheld — ${snapshot.error}`);
      console.warn("[rbc] snapshot withheld", snapshot.leaks);
      return;
    }

    lastSequence = seq;
    const turn = snapshot.match.turnNumber ?? "?";
    send(snapshot).then((ok) => {
      status(ok ? `turn ${turn}, seq ${seq ?? "?"}` : "sidecar not running");
    });
  }

  function schedule() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(capture, CONFIG.settleMs);
  }

  function start() {
    const observer = new MutationObserver(schedule);
    observer.observe(root.document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "data-authoritative-sequence",
        "data-turn-number",
        "data-active-player-id",
        "data-room-phase",
        "data-viewer-score",
        "data-opponent-score",
      ],
    });
    schedule();
    // Expose the discovery helper for the console, nothing else.
    root.rbcDiscover = () => root.RBCDiscovery.report();
    console.info("[rbc] watching. Run rbcDiscover() for the attribute surface.");
  }

  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  root.RBCContent = { CONFIG, capture, status };
})(typeof window !== "undefined" ? window : globalThis);
