"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyReasoning, EFFORTS } = require("../coach/openrouter.js");

const bodyFor = (effort) => {
  const body = { model: "anthropic/claude-sonnet-5" };
  applyReasoning(body, effort);
  return body;
};

/* The bug this pins: "off" used to mean "send no reasoning field", which is
 * not off — it is the provider's own default. On Sonnet 5 that default spent
 * 2314 tokens thinking while "low" spent none, so a three-way comparison was
 * really comparing default / low / high under the labels off / low / high. */
test("none asks for no reasoning; default asks for nothing at all", () => {
  assert.deepEqual(bodyFor("none").reasoning, { effort: "none" });
  assert.equal("reasoning" in bodyFor("default"), false);
});

test("every named effort is sent through verbatim", () => {
  for (const effort of ["minimal", "low", "medium", "high", "xhigh", "max"]) {
    assert.deepEqual(bodyFor(effort).reasoning, { effort }, effort);
  }
});

test("effort is case-insensitive", () => {
  assert.deepEqual(bodyFor("HIGH").reasoning, { effort: "high" });
});

/* A typo must not quietly become the provider default — that is how a
 * mislabelled run gets read as a finding about effort. */
test("an unknown effort is an error, not a silent fallback", () => {
  assert.throws(() => bodyFor("hgih"), /not a reasoning effort/);
});

/* A shell variable set once outlives the code that read it, so the old name
 * keeps arriving long after the rename. It maps to what the word means. */
test("the old name off is read as none, not rejected", () => {
  assert.deepEqual(bodyFor("off").reasoning, { effort: "none" });
  assert.deepEqual(bodyFor("OFF").reasoning, { effort: "none" });
});

test("an omitted effort is the default, and sends nothing", () => {
  assert.equal("reasoning" in bodyFor(undefined), false);
  assert.equal(EFFORTS.has("default"), true);
});
