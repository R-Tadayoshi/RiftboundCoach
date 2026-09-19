"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rbc-")), "state.json");
process.env.RBC_STATE_FILE = stateFile;
const { server } = require("../sidecar/server.js");

const fixture = require("./fixtures/board.js");
require("../extension/src/exhaust.js");
require("../extension/src/board.js");
require("../extension/src/visibility.js");
const Snapshot = require("../extension/src/snapshot.js");

let base;
test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test("serves 204 before any snapshot has arrived", async () => {
  const res = await fetch(`${base}/state`);
  assert.equal(res.status, 204);
});

test("accepts a snapshot and serves it straight back", async () => {
  fixture.build();
  const snap = Snapshot.build();

  const post = await fetch(`${base}/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(snap),
  });
  assert.equal(post.status, 200);
  assert.equal((await post.json()).ok, true);

  const got = await (await fetch(`${base}/state`)).json();
  assert.deepEqual(got, snap, "what goes in comes back unchanged");
});

test("mirrors the newest snapshot to disk", async () => {
  const onDisk = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(onDisk.match.roomCode, "QWLM");
  assert.equal(onDisk.zones.opponent.hand.visible.length, 0);
});

test("keeps a history a coach can diff against", async () => {
  fixture.build({ turnNumber: 8, sequence: "413" });
  await fetch(`${base}/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Snapshot.build()),
  });

  const history = await (await fetch(`${base}/history?n=2`)).json();
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((s) => s.match.turnNumber), [7, 8]);
});

test("health reports what it has seen", async () => {
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.received, 2);
  assert.equal(health.stateFile, stateFile);
});

test("rejects a malformed body rather than storing it", async () => {
  const res = await fetch(`${base}/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal(res.status, 400);
  const still = await (await fetch(`${base}/state`)).json();
  assert.equal(still.match.turnNumber, 8, "the good snapshot survived");
});

test("only binds to loopback", () => {
  assert.equal(server.address().address, "127.0.0.1");
});

test("answers the loopback preflight, so a direct fetch is not blocked", () => {
  // Chrome guards the loopback address space against public sites. The
  // extension posts through its service worker and sidesteps this, but
  // anything else on the machine needs the headers.
  return new Promise((resolve, reject) => {
    const http = require("node:http");
    const req = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
        path: "/state",
        method: "OPTIONS",
        headers: {
          origin: "https://play.riftatlas.com",
          "access-control-request-method": "POST",
          "access-control-request-private-network": "true",
        },
      },
      (res) => {
        try {
          assert.equal(res.statusCode, 204);
          assert.equal(res.headers["access-control-allow-private-network"], "true");
          assert.equal(res.headers["access-control-allow-local-network-access"], "true");
          assert.equal(res.headers["access-control-allow-origin"], "https://play.riftatlas.com");
          resolve();
        } catch (err) {
          reject(err);
        }
      }
    );
    req.on("error", reject);
    req.end();
  });
});
