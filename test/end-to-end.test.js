"use strict";
/* The whole chain, on real files: board -> position -> engine -> ranking.
 *
 * Every other test mocks one seam. This one mocks none, which is the point:
 * the pieces have each been correct while the chain was broken (a position
 * that added to the dealt board instead of replacing it, a legend name that
 * matched nothing, a decklist that was not the deck). Those only showed up
 * when the whole thing ran.
 *
 * Skips loudly without the engine checkout. Unverified is not passing.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ALPHARUNE =
  process.env.ALPHARUNE_ROOT || path.join(__dirname, "..", "..", "chorlick", "alpharune");
const RANK = path.join(__dirname, "..", "engine", "rank");
const POSITION = path.join(__dirname, "..", "engine", "position");
const DECKS = path.join(ALPHARUNE, "decks");

const missing = [];
if (!fs.existsSync(RANK)) missing.push("engine/rank (run engine/build.sh)");
if (!fs.existsSync(POSITION)) missing.push("engine/position");
if (!fs.existsSync(DECKS)) missing.push(`decks under ${ALPHARUNE}`);
if (missing.length) console.warn(`  (end-to-end skipped — missing: ${missing.join(", ")})`);
const live = (fn) => () => (missing.length ? undefined : fn());

const POSITION_TEXT = `
clear P1 all
clear P2 all
turn 11
phase main
turnplayer P1
score P1 5
score P2 6
energy P1 11
power P1 3
place P1 First Mate bfB ready
place P1 Pit Rookie hand
place P1 Challenge hand
hidden P2 4
`;

function writePosition(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rbc-e2e-"));
  const file = path.join(dir, "position.txt");
  fs.writeFileSync(file, text);
  return file;
}

const run = (bin, args) =>
  execFileSync(bin, args, {
    cwd: ALPHARUNE,
    env: { ...process.env, RIFTBOUND_ROOT: "." },
    encoding: "utf8",
    timeout: 300000,
  });

const D1 = path.join(DECKS, "fiora_test.txt");
const D2 = path.join(DECKS, "draven_test.txt");

test(
  "a written position becomes a board the engine agrees with",
  live(() => {
    const out = run(POSITION, [D1, D2, writePosition(POSITION_TEXT)]);
    assert.match(out, /0 failed/, out);
    assert.match(out, /turn 11 \| P1 5 : 6 P2/, "scores and turn survived the resume");

    // Two cards placed in hand, so exactly two PlayCard actions — the count
    // that caught the missing `clear`.
    const plays = (out.match(/PlayCard/g) || []).length;
    assert.equal(plays, 2, `expected 2 PlayCard actions, got ${plays}:\n${out}`);
    assert.match(out, /StandardMove/, "the unit placed at a battlefield can move");
  })
);

test(
  "a position naming a card the deck lacks fails loudly, not silently",
  live(() => {
    const bad = POSITION_TEXT + "\nplace P1 Blade Dancer hand\n";
    let out = "";
    try {
      out = run(POSITION, [D1, D2, writePosition(bad)]);
    } catch (err) {
      out = (err.stdout || "") + (err.stderr || "");
    }
    assert.match(out, /no card of that name/);
    assert.doesNotMatch(out, /0 failed/);
  })
);

test(
  "the ranker returns a rate for every legal action, and passing is the worst",
  live(() => {
    // Few rollouts: this asserts the shape and the one gap that is stable at
    // any count, not an ordering. At this count an ordering would be noise.
    const out = run(RANK, [D1, D2, writePosition(POSITION_TEXT), "30"]);
    const { parseRanking } = require("../coach/engine.js");
    const r = parseRanking(out);

    assert.ok(r.rows.length >= 3, `expected several ranked actions:\n${out}`);
    for (const row of r.rows) {
      assert.ok(row.rate >= 0 && row.rate <= 1, `bad rate ${row.rate}`);
      assert.ok(row.wins + row.losses <= 30, "more results than rollouts");
    }
    assert.ok(r.worst, "the worst option should be identified");
    assert.match(r.worst.action, /EndTurn/, `passing should rank worst:\n${out}`);
  })
);

test(
  "declaring hidden cards changes the rollouts, and is reported",
  live(() => {
    const withHidden = run(RANK, [D1, D2, writePosition(POSITION_TEXT), "20"]);
    assert.match(withHidden, /hidden cards sampled per rollout: P1 0, P2 4/);

    const without = run(
      RANK,
      [D1, D2, writePosition(POSITION_TEXT.replace("hidden P2 4", "")), "20"]
    );
    assert.match(without, /no hidden cards declared/);
  })
);
