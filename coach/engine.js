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
/* The tree search when it is there, the rollout ranker when it is not.
 *
 * `search` answers a strictly larger question — it chooses the continuation
 * instead of rolling it, so it can report a LINE — but `rank` is the known
 * quantity, and a checkout built before the search existed should degrade to
 * it rather than refuse. Whichever ran is named in the output, because "which
 * engine produced this number" is not a detail when the two disagree. */
function searcher() {
  const tree = path.join(ENGINE_DIR, "search");
  if (fs.existsSync(tree)) return { bin: tree, kind: "search" };
  return { bin: path.join(ENGINE_DIR, "rank"), kind: "rank" };
}

function unavailable() {
  const bin = searcher().bin;
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
  /* The line, when a tree produced one. Numbered steps under "THE LINE",
   * stopping at the blank line that ends the block — parsed rather than
   * re-formatted at the source for the same reason the rows are: the
   * human-readable report is the thing that gets checked by eye. */
  const line = [];
  const lineBlock = /^THE LINE[^\n]*\n([\s\S]*?)(?:\n\s*\n|$)/m.exec(stdout);
  if (lineBlock) {
    for (const l of lineBlock[1].split("\n")) {
      const m = /^\s*\d+\.\s+(.+?)\s*$/.exec(l);
      if (m) line.push(m[1]);
    }
  }

  const tooClose = /TOO CLOSE TO CALL: the top (\d+)/.exec(stdout);
  const clear = /^CLEAR: "(.+?)" is ahead/m.exec(stdout);
  const worst = /Worst: "(.+?)" at ([\d.]+)%/.exec(stdout);

  return {
    rows,
    line,
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

/* The tree search's budget, measured rather than guessed — the same way the
 * rollout ranker's 1200 was.
 *
 * On a real board (turn 11, an Elder Dragon in their base, seven cards they
 * could hold) the leader CHANGED between 600 playouts and 2400, and from 2400
 * up the order held: Tideturner, Treasure Hunter, Irelia Fervent, Guardian
 * Angel. By 8000 the leader had separated — 78.4% against 73.2% — where at
 * 2400 the top three sat within three points of each other.
 *
 * 1200 x 12 is 14,400 playouts, roughly 70 seconds. That is nothing against a
 * turn you get minutes to think about, and it buys the difference between an
 * order that is stable and one that changes if you run it twice.
 *
 * Both are overridable, and sims matter more than worlds: sims deepen the
 * tree, worlds average over hands they might hold. Too few worlds and the
 * search is confident about one deal. */
const DEFAULT_SIMS = Number(process.env.RBC_SIMS || 1200);
const DEFAULT_WORLDS = Number(process.env.RBC_WORLDS || 12);

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

function rankBoard(summary, {
  deck1, deck2,
  rollouts = DEFAULT_ROLLOUTS,
  sims = DEFAULT_SIMS,
  worlds = DEFAULT_WORLDS,
  timeoutMs = 900000,
} = {}) {
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

  const engine = searcher();
  const args = engine.kind === "search"
    ? [engineDecks[0], engineDecks[1], file, String(sims), String(worlds)]
    : [engineDecks[0], engineDecks[1], file, String(rollouts)];

  let stdout;
  try {
    stdout = execFileSync(engine.bin, args, {
      cwd: ALPHARUNE,
      env: { ...process.env, RIFTBOUND_ROOT: "." },
      timeout: timeoutMs,
      encoding: "utf8",
    });
  } catch (err) {
    return { ok: false, why: `the ${engine.kind}er failed: ${(err.stderr || err.message).trim().split("\n")[0]}` };
  }

  const ranking = parseRanking(stdout);
  if (!ranking.rows.length) return { ok: false, why: `the ${engine.kind} returned no rows` };
  return { ok: true, ranking, kind: engine.kind, caveats: built.caveats, positionFile: file };
}

/* How the ranking enters the prompt.
 *
 * Deliberately not "the answer is X". When the top options are inside the
 * noise the block says so and lists them as equivalent, because handing the
 * model a false ordering is how a confident wrong line gets written up
 * persuasively — the failure mode this project keeps meeting. */
function rankingBlock(ranking, caveats = []) {
  const lines = [
    "ENGINE RANKING — rollouts from this exact board, not opinion.",
    "The % is wins / (wins+losses+draws) over rollouts that REACHED AN END.",
    "It is a comparison between these lines, not a forecast for the game.",
    "",
  ];
  for (const r of ranking.rows) {
    // The counts were parsed and then thrown away, so a rate over 19 decided
    // rollouts read exactly like one over 1100. They are the difference
    // between a finding and a coin-flip, so they travel with it.
    const decided = r.wins + r.losses;
    lines.push(
      `  ${(r.rate * 100).toFixed(1)}%  ${r.action}` +
        `   [${r.wins}W-${r.losses}L of ${decided} decided]`
    );
  }

  /* An absolute reading, which the ordering alone hides.
   *
   * On a real board every option scored between 3% and 17% while the player
   * was AHEAD on points — because the opponent had a 12-Might Elder Dragon in
   * their base. The engine knew the position was losing and said so in every
   * row; presenting only the order threw that away, and the model went on to
   * describe the board as quiet.
   *
   * So the level gets stated. What to do about it is the model's job; that
   * there is something to do about it is the engine's. */
  const best = ranking.rows.length ? Math.max(...ranking.rows.map((r) => r.rate)) : null;
  if (best !== null && best < 0.35) {
    lines.push(
      `\nEVERY line here is under ${(best * 100).toFixed(0)}%. The search says this ` +
        `position is LOSING whatever is played — the ranking is picking the least ` +
        `bad option, not a good one. Say so, and say what on the board is doing ` +
        `it: name the enemy threat, and what would have to happen to answer it. ` +
        `Do not describe this board as quiet or even.`
    );
  } else if (best !== null && best > 0.8) {
    lines.push(
      `\nEvery line here is strong. The position is winning; the ranking is ` +
        `choosing between good options, so do not manufacture urgency.`
    );
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

  /* The line, when a tree produced one.
   *
   * This is the thing rollouts could not give: after the first move the
   * continuation is CHOSEN rather than rolled, so there is something to show.
   * It goes in with its limits attached, because a numbered list of moves
   * reads as a plan and it is not one — inside a determinization the search
   * knows their hand, so a line that only works because it knew will look
   * better here than it is. */
  if (ranking.line && ranking.line.length > 1) {
    lines.push(`\nTHE LINE the search kept returning to, after the first move:`);
    ranking.line.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
    lines.push(
      `This is one line it explored under ONE sampling of their hidden cards, ` +
        `not a prediction and not a plan to read out. Use it to say what the ` +
        `first move is FOR — what it sets up and what it needs next turn — and ` +
        `say plainly that the continuation assumes they cooperate.`
    );
  }

  if (caveats.length) {
    lines.push(`\nHow the simulated board differs from the real one:`);
    for (const c of caveats) lines.push(`  - ${c}`);
  }
  return lines.join("\n");
}

module.exports = { rankBoard, searcher, toEngineNames, parseRanking, rankingBlock, unavailable, checkAgainstDecks, DEFAULT_ROLLOUTS };
