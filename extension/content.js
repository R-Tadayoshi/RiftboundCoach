/* Wiring: watch the board, build a snapshot per authoritative action, hand it
 * to the local sidecar.
 *
 * Passive throughout. Nothing here clicks, drags, or writes to the page — it
 * reads the board the same way a screenshot would, and the only thing it
 * changes is a small status line of its own.
 */
(function (root) {
  "use strict";

  const CONFIG = {
    /* Capture during real matches as well as solo practice.
     *
     * This started solo-only and the tool is now used for multiplayer, which
     * is the owner's call about their own account. What it does NOT change is
     * the information boundary, and that is worth being exact about, because
     * the two questions get conflated:
     *
     *   The opponent's hand is structurally ABSENT from a snapshot, not
     *   filtered out of one. `REVEALS_BOTH_HANDS` widens only for solo_lab,
     *   where both seats are yours. In `multiplayer` the extractor reads
     *   exactly what is on your screen — your hand, the public board, your
     *   runes — and test/visibility.test.js asserts the opponent's hand is
     *   never readable, face-up or not.
     *
     * So this flag governs WHEN the pipeline runs, never WHAT it may see.
     * Setting it false restores solo-only capture. */
    coachLiveMatches: true,
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

  /* Hand the snapshot to the service worker, which is the only side of this
   * extension allowed to reach the sidecar: a content script carries the
   * page's origin, and a public HTTPS page may not fetch the loopback address
   * space. See background.js. */
  function send(snapshot) {
    // Still inside a back-off: skip without asking, and without the red line.
    if (Date.now() < sidecarDownUntil) return Promise.resolve(false);

    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        if (ok) sidecarDownUntil = 0;
        else sidecarDownUntil = Date.now() + SIDECAR_RETRY_MS;
        resolve(ok);
      };

      try {
        chrome.runtime.sendMessage({ type: "rbc:snapshot", snapshot }, (reply) => {
          // Reading lastError is what stops Chrome logging it as unchecked.
          if (chrome.runtime.lastError) return done(false);
          done(!!reply?.ok);
        });
      } catch (_) {
        // The extension was reloaded under us; the orphan check handles it.
        done(false);
      }
    });
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

    const solo = root.RBCSnapshot.isSoloPractice(board);
    if (!CONFIG.coachLiveMatches && !solo) {
      const mode = root.RBCBoard.mode(board) || "unknown mode";
      status(`paused — ${mode} is not solo practice (solo-only)`);
      return;
    }
    // Which kind of game this is goes on the status pill either way. A tool
    // that behaves differently in a real match should say when it is in one,
    // rather than leaving you to infer it from the absence of a pause.
    const kind = solo ? "practice" : "live";

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
      status(ok ? `${kind} — turn ${turn}, seq ${seq ?? "?"}` : "sidecar not running");
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
    /* Ctrl+Shift+A — ask the coach about the board as it stands.
     *
     * The alternative is alt-tabbing to the page and clicking, which in a
     * timed showdown is the difference between using the tool and not. The
     * answer still appears on the page; this is only the trigger. */
    root.addEventListener("keydown", (e) => {
      if (!e.ctrlKey || !e.shiftKey || e.key.toLowerCase() !== "a") return;
      e.preventDefault();
      status("asking the coach ...");
      try {
        chrome.runtime.sendMessage({ type: "rbc:ask" }, (reply) => {
          if (chrome.runtime.lastError) {
            status(`ask failed — ${chrome.runtime.lastError.message}`);
          } else if (!reply?.ok) {
            status(`ask failed — ${reply?.error || "no reply"}`);
          } else {
            status("asked — the answer lands on the coach page");
          }
        });
      } catch (err) {
        status(`ask failed — ${err.message}`);
      }
    });

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
