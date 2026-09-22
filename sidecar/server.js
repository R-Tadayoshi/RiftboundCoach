#!/usr/bin/env node
/* Local sidecar: holds the newest snapshot, so a separate process can read the
 * game state without knowing anything about browsers.
 *
 * Binds to 127.0.0.1 only. Nothing here is reachable from outside the machine,
 * and nothing is sent anywhere — this is the local port the extractor writes
 * to and the coaching layer reads from.
 *
 *   POST /state    the extension posts a snapshot here
 *   GET  /state    the newest snapshot, or 204 when there isn't one yet
 *   GET  /history  the last N snapshots held in memory
 *   GET  /health   liveness plus a little about what has been seen
 *
 * And the ask/advice pair, which is what makes coaching ON DEMAND rather than
 * continuous. The coach used to poll /state and answer whenever the sequence
 * moved, which meant a model call per rune tap — several per turn, most of
 * them unwanted. Now a request has to be made:
 *
 *   POST /ask      queue one request (the page's button, or Ctrl+Shift+A)
 *   GET  /ask      the coach takes the pending request, clearing it
 *   POST /advice   the coach posts what it came back with
 *   GET  /advice   the page reads the newest answer
 *   GET  /         the page itself
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.RBC_PORT || 8787);
const HOST = "127.0.0.1";
const STATE_FILE = process.env.RBC_STATE_FILE
  ? path.resolve(process.env.RBC_STATE_FILE)
  : path.resolve(__dirname, "..", "state", "state.json");
const HISTORY_MAX = Number(process.env.RBC_HISTORY || 200);

// The page's origin, so the browser will let the content script post here.
const ORIGIN = "https://play.riftatlas.com";
const MAX_BODY = 4 * 1024 * 1024;

let latest = null;
const history = [];
let received = 0;
/* The same warnings arrive with every snapshot while the board's condition
 * persists, and a revealed hand persists for a whole match. Printing them per
 * snapshot buried the snapshot lines they were attached to. */
let lastWarnings = "";

/* One pending request at a time, deliberately.
 *
 * A queue would let you press the button four times while thinking and then
 * watch four answers arrive about four different boards, the first three of
 * them stale. Asking again before the first answer lands replaces the
 * request, which is what "ask about the board as it is now" means. */
let pendingAsk = null;
let latestAdvice = null;
let asked = 0;

function persist(snapshot) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(snapshot, null, 2));
  } catch (err) {
    console.error("[rbc] could not write state file:", err.message);
  }
}

function cors(res) {
  res.setHeader("access-control-allow-origin", ORIGIN);
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  /* Chrome guards the loopback address space against public sites. The
   * extension posts through its service worker, which is not subject to it,
   * so these are a backstop for anything else on the machine that asks —
   * curl, a script, a future page of our own. Both spellings: the header was
   * renamed as the proposal became Local Network Access. */
  res.setHeader("access-control-allow-private-network", "true");
  res.setHeader("access-control-allow-local-network-access", "true");
}

function json(res, code, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(code, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  cors(res);
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/state") {
    let snapshot;
    try {
      snapshot = JSON.parse(await readBody(req));
    } catch (err) {
      json(res, 400, { error: err.message });
      return;
    }
    latest = snapshot;
    history.push(snapshot);
    if (history.length > HISTORY_MAX) history.shift();
    received += 1;
    persist(snapshot);

    const turn = snapshot?.match?.turnNumber ?? "?";
    const seq = snapshot?.sequence ?? "?";
    const whose = snapshot?.match?.isMyTurn === true ? "mine" : snapshot?.match?.isMyTurn === false ? "theirs" : "?";
    console.log(`[rbc] snapshot #${received}  turn ${turn}  seq ${seq}  turn-owner ${whose}`);

    // Only when they change: a standing condition is said once, not per frame.
    const warnings = snapshot?.warnings || [];
    const fingerprint = warnings.join("\u0000");
    if (fingerprint !== lastWarnings) {
      lastWarnings = fingerprint;
      for (const w of warnings) console.warn(`[rbc]   note: ${w}`);
    }

    json(res, 200, { ok: true, received });
    return;
  }

  if (req.method === "GET" && url.pathname === "/state") {
    if (!latest) {
      res.writeHead(204).end();
      return;
    }
    json(res, 200, latest);
    return;
  }

  if (req.method === "GET" && url.pathname === "/history") {
    const n = Math.min(Number(url.searchParams.get("n") || 20), history.length);
    json(res, 200, history.slice(-n));
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, {
      ok: true,
      received,
      held: history.length,
      stateFile: STATE_FILE,
      newestAt: latest?.capturedAt ?? null,
      asked,
      askPending: pendingAsk !== null,
      adviceAt: latestAdvice?.at ?? null,
    });
    return;
  }

  // ── Ask / advice ──────────────────────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/ask") {
    if (!latest) {
      json(res, 409, { error: "no snapshot yet — take an action in the game first" });
      return;
    }
    asked += 1;
    // Stamped with the sequence it was asked about, so the answer can say
    // which board it is about and the page can tell a stale one.
    pendingAsk = { id: asked, at: new Date().toISOString(), sequence: latest.sequence ?? null };
    console.log(`[rbc] ask #${asked} queued (seq ${pendingAsk.sequence ?? "?"})`);
    json(res, 200, { ok: true, ...pendingAsk });
    return;
  }

  if (req.method === "GET" && url.pathname === "/ask") {
    if (!pendingAsk) {
      res.writeHead(204).end();
      return;
    }
    const taken = pendingAsk;
    pendingAsk = null;   // one-shot: taking it is what clears it
    json(res, 200, taken);
    return;
  }

  if (req.method === "POST" && url.pathname === "/advice") {
    try {
      latestAdvice = { ...JSON.parse(await readBody(req)), at: new Date().toISOString() };
    } catch (err) {
      json(res, 400, { error: err.message });
      return;
    }
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/advice") {
    if (!latestAdvice) {
      res.writeHead(204).end();
      return;
    }
    json(res, 200, latestAdvice);
    return;
  }

  // ── The page ──────────────────────────────────────────────────────────
  // Served from here rather than opened as a file:// so it is same-origin
  // with the endpoints above and needs no CORS of its own.
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    let html;
    try {
      html = fs.readFileSync(path.join(__dirname, "ui", "index.html"));
    } catch (err) {
      json(res, 500, { error: `the page is missing: ${err.message}` });
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
    return;
  }

  json(res, 404, { error: "not found" });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`[rbc] sidecar on http://${HOST}:${PORT}`);
    console.log(`[rbc] newest snapshot mirrored to ${STATE_FILE}`);
  });
}

module.exports = { server, PORT, HOST, STATE_FILE };
