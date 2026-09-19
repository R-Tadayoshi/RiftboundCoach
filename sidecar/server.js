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
    for (const w of snapshot?.warnings || []) console.warn(`[rbc]   warning: ${w}`);

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
    });
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
