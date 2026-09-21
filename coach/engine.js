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
const { loadIndex, resolve, parseDeckNames } = require("./alpharune.js");

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

/* Every card a position places must be in that player's decklist, or the
 * engine has no object to move and the line fails.
 *
 * Caught here rather than in C++ because the failure means something
 * specific and fixable: the decklist supplied is not the deck being played.
 * Letting it surface as a per-line "no card of that name owned by that
 * player" buries a wrong-deck problem in what looks like a translation bug —
 * and a position that dropped three cards still ranks, and still prints
 * percentages.
 *
 * Names are compared after resolving both sides through the engine's index,
 * since a decklist writes a legend with its champion tag and the engine does
 * not. */
function checkAgainstDecks(script, deck1, deck2, index) {
  const inDeck = (file) => {
    const names = new Set();
    for (const { name } of parseDeckNames(fs.readFileSync(file, "utf8"))) {
      const r = resolve(index, { name });
      names.add(r.miss ? name.toLowerCase() : r.card.name.toLowerCase());
    }
    return names;
  };

  let decks;
  try {
    decks = { P1: inDeck(deck1), P2: inDeck(deck2) };
  } catch (err) {
    return [{ why: `could not read a decklist: ${err.message}` }];
  }

  const missing = [];
  for (const line of script.split("\n")) {
    const m = /^place (P1|P2) (.+?) (hand|base|trash|bfA|bfB|deck)(?: (ready|exhausted))?$/.exec(line);
    if (!m) continue;
    const [, who, name] = m;
    if (!decks[who].has(name.toLowerCase())) {
      missing.push({ who, name, why: `not in the decklist given for ${who}` });
    }
  }
  return missing;
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

/* Rewrite a decklist into the names the ENGINE knows, and refuse rather than
 * guess.
 *
 * Card naming has bitten this project three times, and this is the fourth
 * shape of it. A legend is PRINTED with its champion tag and NAMED without
 * one — the card reads "Jayce, Defender of Tomorrow" and the registry holds
 * "Defender of Tomorrow" — so a decklist written the way the cards read is a
 * decklist the engine cannot load. It does not fail quietly: the probe throws
 * a C++ runtime_error, which arrives here as "the ranker failed: terminate
 * called..." with the real cause on a line nobody reads.
 *
 * coach/alpharune.js already resolves both spellings, so the translation is
 * free. What it must not do is pass an unresolved name through: that is the
 * throw again, one step later. A name this cannot place is a decklist the
 * ranking cannot be trusted over, and it says so.
 *
 * Section headers are kept as-is — the engine's loader reads them. */
function toEngineNames(deckPath, index) {
  const text = fs.readFileSync(deckPath, "utf8");
  const misses = [];
  const lines = text.split("\n").map((line) => {
    const m = /^(\s*)(\d+)\s+(.+?)\s*$/.exec(line);
    if (!m) return line;
    const r = resolve(index, { name: m[3] });
    if (r.miss) { misses.push(m[3]); return line; }
    return `${m[1]}${m[2]} ${r.card.name}`;
  });
  if (misses.length) {
    throw new Error(
      `${misses.length} card(s) in ${path.basename(deckPath)} are not in the ` +
        `engine's card database: ${misses.slice(0, 6).join(", ")}` +
        (misses.length > 6 ? `, +${misses.length - 6} more` : "") +
        ". The engine cannot build a deck it cannot name."
    );
  }
  const out = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "rbc-deck-")),
    path.basename(deckPath)
  );
  fs.writeFileSync(out, lines.join("\n"));
  return out;
}

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

  const missing = checkAgainstDecks(built.script, deck1, deck2, loadIndex());
  if (missing.length) {
    return {
      ok: false,
      why:
        `${missing.length} card(s) are on the board but not in the decklist ` +
        `supplied for that player — the decklist is not the deck being ` +
        `played: ` +
        missing.slice(0, 6).map((m) => `${m.name} (${m.who})`).join(", ") +
        (missing.length > 6 ? `, +${missing.length - 6} more` : ""),
      missing,
    };
  }

  // The engine's deck loader matches on ITS name for a card, and a legend is
  // printed with its champion tag and named without it — "Jayce, Defender of
  // Tomorrow" on the card, "Defender of Tomorrow" in the registry. A decklist
  // written the way the cards read throws inside the probe, as a C++
  // runtime_error surfacing here as "the ranker failed". Translate first.
  let engineDecks;
  try {
    const idx = loadIndex();
    engineDecks = [deck1, deck2].map((d) => toEngineNames(d, idx));
  } catch (err) {
    return { ok: false, why: err.message };
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
      [engineDecks[0], engineDecks[1], file, String(rollouts)],
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

module.exports = { rankBoard, toEngineNames, parseRanking, rankingBlock, unavailable, checkAgainstDecks, DEFAULT_ROLLOUTS };
