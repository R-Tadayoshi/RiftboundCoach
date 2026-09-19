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
    /* Capture only during solo practice: Goldfish (single_player) and
     * Two-Sided Practice (solo_lab), where both seats are yours.
     *
     * Live advice in a real match is assistance the other player doesn't have
     * and didn't agree to, and Rift Atlas's terms ask users not to interfere
     * with other users. Enforcing it here means no downstream consumer can
     * quietly opt out of it.
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
  let observer = null;

  /* When the sidecar is not running, every game action produced a failed POST
   * and a red line in the console. The request is what logs it — a caught
   * rejection does not stop the browser reporting the network failure — so the
   * only way to stop the noise is to stop asking for a while. */
  const SIDECAR_RETRY_MS = 30000;
  let sidecarDownUntil = 0;

  /* Reloading the extension without refreshing the page leaves the old content
   * script's world alive: its observer and listeners keep firing, but its
   * chrome.runtime is gone. Several reloads leave several of them, which is
   * why the console's context list fills up with copies of this extension —
   * and why the sidecar could receive the same snapshot from each of them.
   *
   * An orphan cannot clean itself up on a signal it never receives, so it
   * checks whether it still belongs to a live extension and stands down when
   * it does not. The copy injected by the refresh is the one that keeps
   * working. */
  function isOrphaned() {
    try {
      return !chrome?.runtime?.id;
    } catch (_) {
      return true; // "Extension context invalidated" throws on access
    }
  }

  function standDown() {
    observer?.disconnect();
    clearTimeout(settleTimer);
    root.document.getElementById("rbc-status")?.remove();
    console.info("[rbc] superseded by a newer copy; this one has stood down.");
  }

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
    // Still inside a back-off: skip without asking, and without the red line.
    if (Date.now() < sidecarDownUntil) return false;
    try {
      await fetch(`${SIDECAR}/state`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(snapshot),
        credentials: "omit",
      });
      sidecarDownUntil = 0;
      return true;
    } catch (_) {
      // The sidecar not running is the ordinary case, not an error worth
      // shouting about — the user starts it when they want to capture.
      sidecarDownUntil = Date.now() + SIDECAR_RETRY_MS;
      return false;
    }
  }

  function capture() {
    if (isOrphaned()) {
      standDown();
      return;
    }

    const board = root.RBCBoard.gameRoot();
    if (!board) {
      status("no board");
      return;
    }

    if (CONFIG.soloOnly && !root.RBCSnapshot.isSoloPractice(board)) {
      const mode = root.RBCBoard.mode(board) || "unknown mode";
      status(`paused — ${mode} is not solo practice (solo-only)`);
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
    observer = new MutationObserver(schedule);
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

    /* Discovery helpers, for working out the markup.
     *
     * These are bound to keystrokes rather than left as console globals
     * because a content script runs in an isolated world: anything it hangs
     * on `window` is invisible to the console's default page context, so
     * `rbcDiscover()` there is a ReferenceError that looks like a broken
     * install. A keypress is handled by this script, in its own world, and
     * its console.log lands in the one console the user is already looking
     * at.
     *
     * They are still exposed as globals for anyone who does switch the
     * console's context, but nothing depends on that.
     *
     * Both are read-only and neither posts anywhere, so they work during a
     * two-sided or two-player match without touching `soloOnly`: that guard
     * gates what reaches the coaching pipeline, not what you may look at on
     * your own screen. `rbcSnapshot()` runs the same visibility filter as a
     * real capture, so its output is already safe to paste. */
    root.rbcDiscover = () => root.RBCDiscovery.report();
    root.rbcSnapshot = () =>
      root.RBCSnapshot.build({
        logLimit: CONFIG.logLimit,
        // The manifest is the truth about which copy this is.
        extractorVersion: (() => {
          try {
            return chrome.runtime.getManifest().version;
          } catch (_) {
            return undefined;
          }
        })(),
      });

    async function dump(label, value) {
      const text = JSON.stringify(value, null, 2);
      console.log(`[rbc] ${label}:`, value);
      console.log(`[rbc] ${label} as text (copy from here):\n${text}`);
      try {
        // A keypress is a user gesture, so the clipboard is available.
        await navigator.clipboard.writeText(text);
        status(`${label} copied to clipboard`);
      } catch (_) {
        status(`${label} printed to console`);
      }
    }

    root.document.addEventListener("keydown", (e) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      const key = (e.key || "").toLowerCase();
      if (key === "d") {
        e.preventDefault();
        dump("discovery", root.rbcDiscover());
      } else if (key === "s") {
        e.preventDefault();
        dump("snapshot", root.rbcSnapshot());
      }
    });

    console.info(
      "[rbc] watching. The console's default context cannot see this script's\n" +
        "     globals, so use the keys rather than typing the function names:\n" +
        "       Ctrl+Shift+D  - attribute surface, for finding selectors\n" +
        "       Ctrl+Shift+S  - the state as it would be captured (never sent)\n" +
        "     Both print here and copy to the clipboard."
    );
  }

  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  root.RBCContent = { CONFIG, capture, status };
})(typeof window !== "undefined" ? window : globalThis);
