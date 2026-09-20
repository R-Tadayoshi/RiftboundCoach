"use strict";
/* The doctor is the thing you run when nothing works, so it has to work when
 * nothing else does — including when the engine checkout is absent, which is
 * exactly the case it exists to diagnose. */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { execFileSync } = require("child_process");

const DOCTOR = path.join(__dirname, "..", "coach", "doctor.js");

function run(env) {
  try {
    return { out: execFileSync("node", [DOCTOR], { encoding: "utf8", env: { ...process.env, ...env }, timeout: 60000 }), code: 0 };
  } catch (err) {
    return { out: (err.stdout || "") + (err.stderr || ""), code: err.status ?? 1 };
  }
}

test("it reports on every link, in dependency order", () => {
  const { out } = run({});
  for (const link of ["node", "engine checkout", "card database"]) {
    assert.match(out, new RegExp(link), `no line for ${link}`);
  }
});

test("a missing engine checkout is a failure that names the fix", () => {
  const { out, code } = run({ ALPHARUNE_ROOT: "/nonexistent/alpharune" });
  assert.equal(code, 1);
  assert.match(out, /engine checkout.*not at/s);
  assert.match(out, /clone chorlick\/alpharune/);
});

/* The point of failing closed is that the coach keeps working. If the doctor
 * ever implies otherwise it is telling people to give up too early. */
test("a failure says the coach still works without the engine", () => {
  const { out } = run({ ALPHARUNE_ROOT: "/nonexistent/alpharune" });
  assert.match(out, /coach still works without it/);
  assert.match(out, /reads card text directly/);
});

test("it never throws, whatever the environment", () => {
  for (const env of [{ ALPHARUNE_ROOT: "/nonexistent" }, { RBC_DECK_MINE: "/nope.txt" }]) {
    const { out } = run(env);
    assert.doesNotMatch(out, /Cannot read propert|is not a function|ENOENT: no such file, open/,
      `the doctor crashed instead of reporting:\n${out}`);
  }
});
