/* Builds the coaching request.
 *
 * The summary is already reduced to the facts that matter, so this file's job
 * is to say what kind of advice is wanted and, just as importantly, what the
 * model must not do: invent cards in a hand nobody can see.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

/* Rules the model must respect, kept in a file rather than in this string so
 * they can be corrected without touching code — and so it is obvious how
 * little is actually known. Missing rules are the main way this coach gives
 * confident bad advice: the board it is handed is accurate, and a model
 * reasoning over an accurate board without the rules recommends plays that
 * cannot be made. */
const RULES_FILE = process.env.RBC_RULES || path.resolve(__dirname, "rules.md");

function loadRules() {
  try {
    return fs.readFileSync(RULES_FILE, "utf8").trim();
  } catch (_) {
    return "";
  }
}

const BASE_SYSTEM = `You are a Riftbound coach sitting beside a player during solo practice.
You give short, concrete, decision-focused advice for the turn in front of them.

How to think:
- Lead with the line you would take, then the reason. Not a list of options.
- Count before you advise: energy and power available, ready runes, might on
  each battlefield, points needed. The player can see the board; what they want
  is the read they might have missed.
- Treat the opponent's READY RUNES as the ceiling on what they can respond
  with. Ready runes mean a trick may be live; all-exhausted means the coast is
  clear and a greedy line is safer.
- Use their trash and deck count for card-availability reads. Two copies of a
  trick already spent and a thin deck makes the third less likely; an untouched
  deck makes it more so.
- When several POSSIBLE BUILDs are listed, the opponent is on at most one of
  them. Use the EVIDENCE THIS GAME line to weigh them: a card they have played
  that is absent from a build is evidence against it, not proof — tech cards
  and sideboard swaps exist. If the evidence points one way, say which build
  you are playing against and how confident that is. If it does not, say the
  matchup is still open and name what would tell them apart.
- If you are given cards SEEN BEFORE for their champion, treat it as a
  prior from past games, not as their current list. It is evidence about what
  the archetype tends to play, weakened by how few games it rests on, and
  overridden by this game's board. Say "they have shown X before" — never
  "they have X".
- Say what to hold up defensively, and what it costs to hold it.

Hard rules:
- You CANNOT see the opponent's hand, and neither can the player. You are given
  only how many cards are in it. Never name, guess at, or reason about specific
  cards in their hand. Reason from counts, their trash, their deck size, their
  ready runes and what their deck has already shown.
- If a field reads null, it is unknown, not zero and not ready. Say you cannot
  tell rather than filling the gap.
- Never invent a card. Only name cards given to you in this message.
- Be brief. Six sentences at most, no preamble, no restating the board.

Legality:
- The RULES section below is authoritative and binding. Never recommend a play
  it forbids.
- That section is INCOMPLETE. Where it does not settle whether a play is
  legal, say so plainly — "if you can do X" — rather than assuming it is.
  Recommending an illegal play is the worst failure available to you: it looks
  like advice and cannot be taken.`;

/* Composed once, at load. The rules ride in the system message so they sit
 * ahead of the board and are not competing with it for attention. */
const SYSTEM = (() => {
  const rules = loadRules();
  return rules ? `${BASE_SYSTEM}\n\n---\n\nRULES\n\n${rules}` : BASE_SYSTEM;
})();

function describeRunes(runes) {
  if (!runes || !runes.total) return "none";
  const domains = Object.entries(runes.byDomain)
    .map(([domain, n]) => `${n} ${domain}`)
    .join(", ");
  const parts = [`${runes.ready} ready of ${runes.total}`];
  if (domains) parts.push(`(${domains})`);
  if (runes.unknown) parts.push(`[${runes.unknown} unreadable]`);
  return parts.join(" ");
}

/* Units on the board, with whether they can still act.
 *
 * "state unknown" is reported rather than assumed, because a coach told a
 * blocker is ready when it is exhausted advises worse than one told nothing. */
function describeUnits(units) {
  if (!units?.length) return "empty";
  return units
    .map((u) => {
      const state =
        u.exhausted === true ? "exhausted" : u.exhausted === false ? "ready" : "state unknown";
      // "per the log" is load-bearing: the board carries no marker for this,
      // so the pairing is read out of the match log and could be stale.
      const gear = u.attachedTo ? `, equipped to ${u.attachedTo} per the log` : "";
      return `${u.name} (${state}${gear})`;
    })
    .join(", ");
}

/* Cards in hand, which carry no exhaustion because they cannot have any.
 * Rendering them as "state unknown" reads as a gap in the capture rather than
 * what it is: a question that does not apply. */
function describeHand(cards) {
  if (!cards?.length) return "empty";
  return cards.map((c) => c.name).join(", ");
}

function describeCard(card) {
  const stats = [
    card.energy !== null ? `${card.energy} energy` : null,
    card.might !== null ? `might ${card.might}` : null,
    card.power !== null ? `power ${card.power}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const head = [card.name, card.type, stats].filter(Boolean).join(" — ");
  return card.text ? `${head}: ${card.text}` : head;
}

/* Two priors, reported separately because they are different evidence.
 *
 * Observed cards are things THIS opponent has actually put on the table, with
 * the sample size attached. Seeded cards come from a decklist the player
 * supplied: better coverage, but no guarantee the opponent is on that build. */
function describePrior(prior) {
  if (!prior) return "";
  const blocks = [];

  if (prior.cards?.length) {
    const lines = prior.cards
      .slice(0, 14)
      .map((c) => `  - ${c.name} (seen in ${c.seen} of ${c.of})`)
      .join("\n");
    blocks.push(
      `SEEN BEFORE FROM ${prior.champion.toUpperCase()} — across ${
        prior.matchesPlayed
      } past game(s), public cards only. A prior, not their list:\n${lines}`
    );
  }

  for (const build of prior.variants || []) {
    const { matches, sideOnly, absent } = build.evidence;
    const evidence = [];
    if (matches.length) evidence.push(`played so far and in this build: ${matches.join(", ")}`);
    if (sideOnly.length) evidence.push(`in its sideboard only: ${sideOnly.join(", ")}`);
    if (absent.length) evidence.push(`played but NOT in this build: ${absent.join(", ")}`);

    const lines = build.cards
      .slice(0, 26)
      .map((c) => `  - ${c.name}${c.copies > 1 ? ` x${c.copies}` : ""}`)
      .join("\n");

    blocks.push(
      `POSSIBLE BUILD "${build.name.toUpperCase()}" for ${prior.champion} — a list ` +
        `you supplied, NOT confirmed for this opponent:\n${lines}` +
        (build.battlefields.length ? `\n  battlefields: ${build.battlefields.join(", ")}` : "") +
        (build.runes.length
          ? `\n  runes: ${build.runes.map((r) => `${r.copies} ${r.name}`).join(", ")}`
          : "") +
        (evidence.length ? `\n  EVIDENCE THIS GAME: ${evidence.join("; ")}` : "\n  EVIDENCE THIS GAME: none yet")
    );
  }

  if (prior.seeded?.length) {
    const lines = prior.seeded
      .slice(0, 24)
      .map((c) => `  - ${c.name}${c.copies > 1 ? ` x${c.copies}` : ""}`)
      .join("\n");
    blocks.push(
      `TYPICAL ${prior.champion.toUpperCase()} LIST — from a decklist provided by the ` +
        `player, NOT confirmed for this opponent. They may be on a different ` +
        `build, and nothing here has been seen this game:\n${lines}`
    );
  }

  return blocks.length ? `\n${blocks.join("\n\n")}\n` : "";
}

function buildUserMessage(summary, cardText, prior) {
  const { me, them, battlefields, turn } = summary;

  const relevant = new Set();
  for (const u of [...me.hand, ...me.base, ...me.battlefieldA, ...me.battlefieldB]) {
    if (u.code) relevant.add(u.code);
  }
  for (const u of [...them.base, ...them.battlefieldA, ...them.battlefieldB]) {
    if (u.code) relevant.add(u.code);
  }
  for (const t of them.trash) if (t.code) relevant.add(t.code);

  const cards = [...relevant]
    .map((code) => cardText[code])
    .filter(Boolean)
    .map((card) => `- ${describeCard(card)}`)
    .join("\n");

  const priorBlock = describePrior(prior);
  return `TURN ${turn.number ?? "?"} (${turn.step ?? "?"}) — ${
    turn.isMyTurn === true ? "my turn" : turn.isMyTurn === false ? "their turn" : "turn owner unknown"
  }

ME — ${me.name ?? "?"} (${me.champion ?? me.legend ?? "?"})
  score ${me.score ?? "?"} of 8
  floating: energy ${me.floating.energy ?? "?"}, power ${me.floating.power ?? "?"}
  runes: ${describeRunes(me.runes)}
  hand: ${me.handCount} card(s) — ${describeHand(me.hand)}
  base: ${describeUnits(me.base)}
  deck: ${me.deck.main ?? "?"} cards, rune deck ${me.deck.rune ?? "?"}

THEM — ${them.name ?? "?"} (${them.champion ?? them.legend ?? "?"})
  score ${them.score ?? "?"} of 8
  floating: energy ${them.floating.energy ?? "?"}, power ${them.floating.power ?? "?"}
  runes: ${describeRunes(them.runes)}   <-- what they can respond with
  hand: ${them.handCount} card(s), contents NOT VISIBLE
  base: ${describeUnits(them.base)}
  deck: ${them.deck.main ?? "?"} cards, rune deck ${them.deck.rune ?? "?"}
  spent (their trash): ${
    them.trash.length
      ? them.trash.map((t) => `${t.name}${t.count > 1 ? ` x${t.count}` : ""}`).join(", ")
      : "nothing yet"
  }

${priorBlock}
BATTLEFIELDS
  A — ${battlefields.A.name ?? "?"}: mine = ${describeUnits(battlefields.A.mine)}; theirs = ${describeUnits(battlefields.A.theirs)}
  B — ${battlefields.B.name ?? "?"}: mine = ${describeUnits(battlefields.B.mine)}; theirs = ${describeUnits(battlefields.B.theirs)}

CARD TEXT
${cards || "- (none resolved)"}
${summary.fieldsUnread.length ? `\nUNREADABLE THIS TURN: ${summary.fieldsUnread.join(", ")} — treat as unknown.` : ""}

What is the line?`;
}

module.exports = {
  SYSTEM,
  BASE_SYSTEM,
  loadRules,
  RULES_FILE,
  buildUserMessage,
  describeRunes,
  describeUnits,
  describeHand,
  describeCard,
  describePrior,
};
