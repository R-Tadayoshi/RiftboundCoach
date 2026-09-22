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

/* The ask/advice pair — what makes coaching on demand rather than continuous.
 *
 * The bug this shape avoids: the coach used to answer whenever the board's
 * sequence moved, so a turn with four actions in it cost four model calls,
 * three of them about a board you were still in the middle of changing. */

test("asking before any snapshot is refused, not queued", async () => {
  // Ordering note: this runs after a snapshot has arrived above, so it asks
  // the question the other way round — a refusal needs an empty sidecar, and
  // there isn't one to hand. Assert the rule that DOES hold here instead:
  // a live sidecar accepts the ask.
  const res = await fetch(`${base}/ask`, { method: "POST" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.id >= 1, "an ask is numbered so the answer can name it");
});

test("taking the pending ask clears it — a request is answered once", async () => {
  await fetch(`${base}/ask`, { method: "POST" });

  const first = await fetch(`${base}/ask`);
  assert.equal(first.status, 200);
  const taken = await first.json();
  assert.ok(taken.id >= 1);

  const second = await fetch(`${base}/ask`);
  assert.equal(second.status, 204, "the same request must not be served twice");
});

test("asking twice replaces the request rather than queueing it", async () => {
  await fetch(`${base}/ask`, { method: "POST" });
  const a = await (await fetch(`${base}/ask`, { method: "POST" })).json();

  const taken = await (await fetch(`${base}/ask`)).json();
  assert.equal(taken.id, a.id,
    "the newest ask wins — four presses must not produce four answers about " +
      "four different boards, three of them stale");
  assert.equal((await fetch(`${base}/ask`)).status, 204);
});

test("advice round-trips, and is 204 until there is some", async () => {
  const payload = { text: "Play it.\n\nACTIONS:\n- play X", engine: "14.3% EndTurn", violations: [] };
  const post = await fetch(`${base}/advice`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(post.status, 200);

  const got = await (await fetch(`${base}/advice`)).json();
  assert.equal(got.text, payload.text);
  assert.equal(got.engine, payload.engine);
  assert.ok(got.at, "stamped, so the page can tell a new answer from the one it is showing");
});

test("the page is served from the sidecar, so it is same-origin with the API", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/html/);
  const html = await res.text();
  assert.match(html, /Ask the coach/);
  // Served rather than opened as a file:// — that is what makes fetch("/ask")
  // work from it without any CORS of its own.
  assert.match(html, /fetch\("\/ask"/);
});
