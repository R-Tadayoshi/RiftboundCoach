#!/usr/bin/env node
/* The coaching loop.
 *
 * Watches the sidecar for a new authoritative state, and when the turn is the
 * player's, asks for a line and prints it.
 *
 *   node coach/index.js              coach on each of my turns
 *   node coach/index.js --dry-run    build and print the prompt, send nothing
 *   node coach/index.js --once       coach the current state, then exit
 *   node coach/index.js --every      coach on every change, not just my turns
 *   node coach/index.js --compare    ask several models the same turn, once
 */
"use strict";

const { summarize, codesToResolve } = require("./summarize.js");
const { SYSTEM, buildUserMessage } = require("./prompt.js");
const { ask, DEFAULT_MODEL } = require("./openrouter.js");
const cards = require("./cards.js");
const archetypes = require("./archetypes.js");
const legality = require("./legality.js");
const engine = require("./engine.js");

const SIDECAR = process.env.RBC_SIDECAR || "http://127.0.0.1:8787";
const POLL_MS = Number(process.env.RBC_POLL_MS || 1500);

const argv = process.argv.slice(2);
const args = new Set(argv);

/** --flag value, or the environment, or nothing. */
function argValue(flag, envKey) {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  return envKey ? process.env[envKey] : undefined;
}
const DRY_RUN = args.has("--dry-run");
const ONCE = args.has("--once");
const EVERY = args.has("--every");
const COMPARE = args.has("--compare");

/* --rank runs the engine over this exact board and hands the model a ranked
 * list instead of asking it to rank in its head. Needs both decklists: ours is
 * known, theirs is a guess, and a wrong guess means the opponent's unseen
 * cards get sampled from the wrong pool. So it is opt-in and explicit. */
const RANK = args.has("--rank");
const DECK_MINE = argValue("--deck-mine", "RBC_DECK_MINE");
const DECK_THEIRS = argValue("--deck-theirs", "RBC_DECK_THEIRS");

/* Whether a bigger model — or a harder think — is worth it here is a question
 * about THIS prompt on YOUR boards, and no amount of arguing about it
 * substitutes for running the same turn through a few and reading the answers.
 *
 * An entry is a slug, optionally with an effort after an "@":
 *
 *   anthropic/claude-sonnet-5           the default effort
 *   anthropic/claude-sonnet-5@high      the same model, thinking harder
 *   anthropic/claude-sonnet-5@none      no thinking at all
 *   anthropic/claude-sonnet-5@default   whatever it does unasked
 *
 * Efforts: none, minimal, low, medium, high, xhigh, max, default. Note that
 * "default" is not "none" — on Sonnet 5, sending no reasoning field produced
 * more thinking than asking for "low".
 *
 * The default set below walks one model up the effort ladder rather than
 * lining three models up at one effort: which model is a question you can
 * only ask once effort means what it says.
 *
 * "@" rather than ":" because OpenRouter slugs use ":" themselves (:batch). */
const COMPARE_MODELS = (
  process.env.RBC_COMPARE ||
  "anthropic/claude-sonnet-5@none," +
    "anthropic/claude-sonnet-5@low," +
    "anthropic/claude-sonnet-5@medium," +
    "anthropic/claude-sonnet-5@high"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean)
  .map((entry) => {
    const at = entry.lastIndexOf("@");
    return at > 0
      ? { model: entry.slice(0, at), effort: entry.slice(at + 1), label: entry }
      : { model: entry, effort: undefined, label: entry };
  });

/* Solo practice only, checked again here.
 *
 * The extractor already refuses to capture anything else, so this should never
 * fire. It is here because the guard that matters is the one nearest the
 * thing being guarded: if a snapshot ever reaches this process from somewhere
 * else, the coach still will not run on a live match against another person. */
const SOLO_MODES = new Set(["single_player", "solo_lab"]);
const SOLO_ONLY = process.env.RBC_SOLO_ONLY === "1";

let lastSequence = null;

async function readState() {
  const res = await fetch(`${SIDECAR}/state`);
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`sidecar ${res.status}`);
  return res.json();
}

function shouldCoach(snapshot) {
  if (!snapshot || snapshot.error) return false;
  if (snapshot.sequence !== null && snapshot.sequence === lastSequence) return false;

  const mode = snapshot.match?.mode;
  // Two gates guarded this, the extension's and this one, so that no
  // downstream consumer could quietly opt out of the extension's. Both now
  // default to running in real matches; set RBC_SOLO_ONLY=1 to restore the
  // old behaviour on this side.
  //
  // What the mode still decides is what the snapshot CONTAINS: solo_lab
  // carries both hands because both seats are yours, and multiplayer carries
  // the opponent's hand as a count and nothing else. That is the extractor's
  // job and this flag does not reach it.
  if (SOLO_ONLY && !SOLO_MODES.has(mode)) {
    console.log(`[coach] "${mode}" is not solo practice and RBC_SOLO_ONLY is set — standing down.`);
    return false;
  }
  if (snapshot.connection?.state && snapshot.connection.state !== "open") {
    console.log(`[coach] connection is "${snapshot.connection.state}"; the board may be stale.`);
    return false;
  }
  if (!EVERY && snapshot.match?.isMyTurn !== true) return false;
  return true;
}

function banner(snapshot) {
  const m = snapshot.match || {};
  const me = snapshot.players?.self?.name ?? "?";
  const them = snapshot.players?.opponent?.name ?? "?";
  return (
    `\n${"─".repeat(64)}\n` +
    `turn ${m.turnNumber ?? "?"} · ${m.turnStep ?? "?"} · ` +
    `${me} ${snapshot.players?.self?.score ?? "?"} — ` +
    `${snapshot.players?.opponent?.score ?? "?"} ${them}\n` +
    `${"─".repeat(64)}`
  );
}

async function coach(snapshot) {
  lastSequence = snapshot.sequence;

  const summary = summarize(snapshot);

  /* Read the prior BEFORE folding this game in, so a card first seen a moment
   * ago is not handed back as if past games had established it. */
  const prior = archetypes.priorFor(snapshot);
  archetypes.observe(snapshot);

  const cardText = await cards.resolve(codesToResolve(snapshot));
  let user = buildUserMessage(summary, cardText, prior);

  console.log(banner(snapshot));

  /* The engine's ranking, if it can be had. Every failure here is reported
   * and then stepped over: the coach reasoning unaided is the behaviour we
   * had all along and it is not worthless. What would be worthless is a
   * percentage attached to a board the engine could not faithfully build. */
  if (RANK) {
    const started = Date.now();
    process.stdout.write("  [engine] ranking this board ... ");
    const r = engine.rankBoard(summary, { deck1: DECK_MINE, deck2: DECK_THEIRS });
    if (!r.ok) {
      console.log(`no.\n  [engine] ${r.why}`);
      console.log("  [engine] answering without it — the advice below is the model's alone.");
    } else {
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      const block = engine.rankingBlock(r.ranking, r.caveats);
      console.log(`done (${secs}s)\n`);
      console.log(block + "\n");
      user = `${user}\n\n---\n${block}\n\nExplain the engine's answer. It ranked ` +
        `these lines by playing this board out; you did not. Where it separates ` +
        `an option, lead with that one and say why it is good in Riftbound terms. ` +
        `Where it does not separate them, say they are equivalent rather than ` +
        `picking one.`;
    }
  }

  if (DRY_RUN) {
    console.log("\n[system]\n" + SYSTEM + "\n\n[user]\n" + user);
    return;
  }

  /* Ask, then check what came back. A provably illegal action is handed
   * straight back with its rule, once: the model reasons well and forgets
   * rules, and a second look with the violation named fixes most of them.
   * One retry only — a model that breaks the same rule twice is not going to
   * be argued out of it, and the player is waiting. */
  async function askChecked(opts) {
    const first = await ask(opts);
    const violations = legality.check(first.text, summary, cardText);
    /* Counted so silence can be told apart from approval: an answer with no
     * ACTIONS block is not a clean one, it is an unchecked one. */
    const checked = legality.parseActions(first.text).length;
    if (!violations.length) return { ...first, violations: [], checked };

    const complaint =
      "That answer contains a play the rules do not allow:\n\n" +
      violations.map((v) => `- ${v.action}\n  ${v.why} (rule ${v.rule})`).join("\n") +
      "\n\nGive the answer again with a legal line. Do not defend the illegal " +
      "one — the board above is the truth.";

    try {
      const second = await ask({
        ...opts,
        user: `${opts.user}\n\n---\nYOUR PREVIOUS ANSWER WAS REJECTED.\n${complaint}`,
      });
      return {
        ...second,
        violations,
        retried: true,
        checked: legality.parseActions(second.text).length,
        stillIllegal: legality.check(second.text, summary, cardText),
      };
    } catch (err) {
      return { ...first, violations, checked, retryFailed: err.message };
    }
  }

  function reportChecks(result) {
    if (!result.checked) {
      console.warn(
        "  [checker] no ACTIONS block in that answer — nothing was checked."
      );
    }
    for (const v of result.violations || []) {
      console.warn(`  [checker] rejected: ${v.action} — ${v.why} (rule ${v.rule})`);
    }
    if (result.retried) {
      console.warn(
        result.stillIllegal?.length
          ? "  [checker] the retry is STILL illegal — treat this answer with suspicion."
          : "  [checker] retried, and the second answer checks out."
      );
    }
  }

  if (COMPARE) {
    // Sequential, not parallel: the point is to read them side by side, and a
    // rate limit hit halfway through a race tells you nothing.
    for (const { model, effort, label } of COMPARE_MODELS) {
      const started = Date.now();
      try {
        const result = await askChecked({ system: SYSTEM, user, model, effort });
        const { text, usage, reasoningTokens, truncated } = result;
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        const thinking = reasoningTokens ? `, ${reasoningTokens} thinking` : "";
        console.log(
          `\n### ${label}  (${secs}s${usage ? `, ${usage.prompt_tokens}+${usage.completion_tokens} tok${thinking}` : ""})${
            truncated ? "  [CUT OFF — raise RBC_MAX_TOKENS]" : ""
          }\n`
        );
        console.log(text + "\n");
        reportChecks(result);
      } catch (err) {
        console.error(`\n### ${label} — failed: ${err.message}\n`);
      }
    }
    return;
  }

  try {
    const result = await askChecked({ system: SYSTEM, user });
    const { text, model, usage, truncated } = result;
    console.log("\n" + text + "\n");
    reportChecks(result);
    if (truncated) {
      console.warn("  [cut off before the end — raise RBC_MAX_TOKENS]");
    }
    console.log(
      `  — ${model}${usage ? `, ${usage.prompt_tokens}+${usage.completion_tokens} tokens` : ""}`
    );
  } catch (err) {
    console.error("[coach] " + err.message);
  }

  for (const w of snapshot.warnings || []) console.error("[coach] board warning: " + w);
}

/* `quiet` keeps the polling loop from repeating itself every second and a
 * half; a single --once run says why nothing happened, because silence there
 * is indistinguishable from a broken install. */
async function tick(quiet) {
  let snapshot;
  try {
    snapshot = await readState();
  } catch (err) {
    if (!quiet) {
      console.error(`[coach] cannot reach the sidecar at ${SIDECAR} — is it running? (${err.message})`);
    }
    return false;
  }

  if (!snapshot) {
    if (!quiet) {
      console.log(
        "[coach] the sidecar is running but holds no snapshot yet.\n" +
          "        The extension posts one per game action, so: open a match,\n" +
          "        take an action, and check the page's status line bottom-right.\n" +
          "        If it reads \"sidecar not running\", the extension is not\n" +
          "        reaching it — reload the extension and refresh the tab."
      );
    }
    return false;
  }

  if (!shouldCoach(snapshot)) {
    if (!quiet && snapshot.match?.isMyTurn !== true && !EVERY) {
      console.log(
        `[coach] holding — it is not your turn (turn ${snapshot.match?.turnNumber ?? "?"}, ` +
          `${snapshot.match?.turnStep ?? "?"}). Use --every to coach anyway.`
      );
    }
    return false;
  }

  await coach(snapshot);
  return true;
}

async function main() {
  console.log(`[coach] watching ${SIDECAR}`);
  console.log(
    `[coach] model: ${
      DRY_RUN
        ? "(dry run — nothing is sent)"
        : COMPARE
        ? `comparing ${COMPARE_MODELS.join(", ")}`
        : DEFAULT_MODEL
    }`
  );
  console.log(`[coach] ${EVERY ? "coaching every change" : "coaching on my turns"}\n`);

  if (ONCE || COMPARE) {
    await tick(false);
    return;
  }

  // The first pass reports what it finds; after that only changes are worth
  // a line, or the terminal fills with the same complaint.
  let announced = false;
  for (;;) {
    const coached = await tick(announced);
    if (coached) announced = false;
    else announced = true;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[coach] " + err.stack);
    process.exit(1);
  });
}

module.exports = { shouldCoach, summarize, SOLO_MODES, SOLO_ONLY };
