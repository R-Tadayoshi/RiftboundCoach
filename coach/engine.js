/* Running the engine from the coach, and reading its answer back.
 *
 * The division of labour this whole detour was for: the engine decides which
 * line is better, the model explains why in words. The model was never bad at
 * explaining — it was bad at knowing, because nothing in the prompt ranked one
 * legal option above another.
 *
 * Everything here fails closed. A position that will not build, a binary that
 * is not there, a ranking whose top options sit inside the noise — each one
 * returns "no engine answer" rather than something that looks like one. The
 * coach can always fall back to reasoning unaided; what it must never do is
 * present a guess wearing a percentage.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { toPosition } = require("./to-position.js");

const ENGINE_DIR = path.join(__dirname, "..", "engine");
const ALPHARUNE =
  process.env.ALPHARUNE_ROOT || path.join(__dirname, "..", "..", "chorlick", "alpharune");

/** Why the engine cannot be used right now, or null if it can. */
function unavailable() {
  const bin = path.join(ENGINE_DIR, "rank");
  if (!fs.existsSync(bin)) return `${bin} is not built — run engine/build.sh`;
  if (!fs.existsSync(path.join(ALPHARUNE, "cards"))) {
    return `no alpharune checkout at ${ALPHARUNE} — set ALPHARUNE_ROOT`;
  }
  return null;
}

/* The ranker's output, which is written for a person to read. Parsed rather
 * than re-formatted at the source because a human-readable report is the thing
 * that gets checked by eye when a number looks wrong. */
function parseRanking(stdout) {
  const rows = [];
  for (const line of stdout.split("\n")) {
    const m = /^\s{2,}(\d+\.\d)%\s+(.+?)\s+\((\d+)-(\d+)(?:,.*)?\)\s*$/.exec(line);
    if (m) {
      rows.push({
        rate: Number(m[1]) / 100,
        action: m[2].trim(),
        wins: Number(m[3]),
        losses: Number(m[4]),
      });
    }
  }
  const tooClose = /TOO CLOSE TO CALL: the top (\d+)/.exec(stdout);
  const clear = /^CLEAR: "(.+?)" is ahead/m.exec(stdout);
  const worst = /Worst: "(.+?)" at ([\d.]+)%/.exec(stdout);

  return {
    rows,
    tiedAtTop: tooClose ? Number(tooClose[1]) : clear ? 1 : rows.length,
    best: clear ? clear[1] : null,
    worst: worst ? { action: worst[1], rate: Number(worst[2]) / 100 } : null,
    raw: stdout,
  };
}

/**
 * Rank the moves available on a captured board.
 * Returns {ok:false, why} or {ok:true, ranking, caveats}.
 */
/* 1200 is measured, not chosen for comfort: on the position this was built
 * against the top four actions sat inside the noise at 40, 150 and 400
 * rollouts, and separated at 1200. Five actions at that count is about 80
 * seconds — nothing against a turn you get minutes for, and the alternative
 * is a fast answer that says TOO CLOSE TO CALL. */
const DEFAULT_ROLLOUTS = Number(process.env.RBC_ROLLOUTS || 1200);

function rankBoard(summary, { deck1, deck2, rollouts = DEFAULT_ROLLOUTS, timeoutMs = 900000 } = {}) {
  const why = unavailable();
  if (why) return { ok: false, why };
  if (!deck1 || !deck2) {
    return {
      ok: false,
      why:
        "the engine needs a decklist for BOTH players. Mine is known; theirs " +
        "has to be supplied or guessed from the seeded archetypes, and a wrong " +
        "list means the hidden cards are sampled from the wrong pool.",
    };
  }

  let built;
  try {
    built = toPosition(summary);
  } catch (err) {
    return { ok: false, why: `could not translate the board: ${err.message}` };
  }
  if (built.blocked.length) {
    return {
      ok: false,
      why:
        `${built.blocked.length} card(s) the engine cannot model faithfully: ` +
        built.blocked.map((b) => `${b.name} (${b.why.split("—")[0].trim()})`).join("; "),
      blocked: built.blocked,
    };
  }

  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "rbc-pos-")),
    "position.txt"
  );
  fs.writeFileSync(file, built.script);

  let stdout;
  try {
    stdout = execFileSync(
      path.join(ENGINE_DIR, "rank"),
      [deck1, deck2, file, String(rollouts)],
      { cwd: ALPHARUNE, env: { ...process.env, RIFTBOUND_ROOT: "." }, timeout: timeoutMs, encoding: "utf8" }
    );
  } catch (err) {
    return { ok: false, why: `the ranker failed: ${(err.stderr || err.message).trim().split("\n")[0]}` };
  }

  const ranking = parseRanking(stdout);
  if (!ranking.rows.length) return { ok: false, why: "the ranker returned no rows" };
  return { ok: true, ranking, caveats: built.caveats, positionFile: file };
}

/* How the ranking enters the prompt.
 *
 * Deliberately not "the answer is X". When the top options are inside the
 * noise the block says so and lists them as equivalent, because handing the
 * model a false ordering is how a confident wrong line gets written up
 * persuasively — the failure mode this project keeps meeting. */
function rankingBlock(ranking, caveats = []) {
  const lines = ["ENGINE RANKING — rollouts from this exact board, not opinion:"];
  for (const r of ranking.rows) {
    lines.push(`  ${(r.rate * 100).toFixed(1)}%  ${r.action}`);
  }

  if (ranking.tiedAtTop > 1) {
    lines.push(
      `\nThe top ${ranking.tiedAtTop} are within the noise of each other — the engine ` +
        `does NOT rank them. Treat them as equivalent and choose on grounds it ` +
        `cannot see. Do not present one as best.`
    );
  } else if (ranking.best) {
    lines.push(`\nThe engine separates "${ranking.best}" from the rest. Lead with it.`);
  }

  if (ranking.worst) {
    lines.push(
      `Worst by a clear margin: "${ranking.worst.action}" at ` +
        `${(ranking.worst.rate * 100).toFixed(1)}%. Say so if the player might consider it.`
    );
  }

  if (caveats.length) {
    lines.push(`\nHow the simulated board differs from the real one:`);
    for (const c of caveats) lines.push(`  - ${c}`);
  }
  return lines.join("\n");
}

module.exports = { rankBoard, parseRanking, rankingBlock, unavailable, DEFAULT_ROLLOUTS };
