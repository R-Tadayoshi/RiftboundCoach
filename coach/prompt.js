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
const lessons = require("./lessons.js");

/* Everything after this marker is upkeep for whoever edits the file — where
 * the PDF came from, how to add a rule, what is missing. None of it helps the
 * model, and the system prompt is re-sent on every turn of every game, so a
 * paragraph of provenance is a paragraph paid for hundreds of times. */
const HUMAN_ONLY = "<!-- human-only";

function loadRules() {
  let text;
  try {
    text = fs.readFileSync(RULES_FILE, "utf8");
  } catch (_) {
    return "";
  }
  const cut = text.indexOf(HUMAN_ONLY);
  return (cut === -1 ? text : text.slice(0, cut)).trim();
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
- READ THEIR BOARD BEFORE YOU DEVELOP YOURS. Every unit they control is listed
  under THEM, with its Might in the card text you are given. Before advising
  anything, find the biggest threat they have on the table and say what it
  does to the player, then advise around it. A board with a large enemy unit
  on it is not a quiet board, and "both battlefields are empty" is not the
  same sentence as "the board is empty" — a unit sitting in their base moves
  to a battlefield the moment it readies.

Hard rules:
- You CANNOT see the opponent's hand, and neither can the player. You are given
  only how many cards are in it. Never name, guess at, or reason about specific
  cards in their hand. Reason from counts, their trash, their deck size, their
  ready runes and what their deck has already shown.
- If a field reads null, it is unknown, not zero and not ready. Say you cannot
  tell rather than filling the gap.
- Never invent a card. Only name cards given to you in this message.
- Be brief. Six sentences at most, no preamble, no restating the board.

End every answer with a machine-readable block, exactly like this:

ACTIONS:
- play <unit> to base
- move <unit> from base to battlefield A
- pass

One line per action, in the order you would take them, using only the verbs
play / move / hide / ready / pass. Name cards exactly as this message names
them, and name destinations as "base", "battlefield A" or "battlefield B".

If something readies a unit mid-line, WRITE IT DOWN — "ready <card> using
<source>". A line that moves a unit it never said was readied reads as
illegal, and the step you left in prose is usually the step the whole line
depends on:

- play <unit> to base
- play <spell> targeting <unit>
- ready <unit> using <legend or card>
- move <unit> from base to battlefield A

If an action chooses a target, say so with "targeting <card>":

- play <spell> targeting <their unit>
- move <unit> from base to battlefield B

Use the real names from this message in place of the placeholders.

This block is checked against the rules by code before it reaches the player,
so a line you cannot write down plainly is a line you have not thought
through — and an unnamed target is a target nothing can check.

Before you conclude that a unit cannot act:
- "It enters exhausted" and "nothing can reach there" describe this instant,
  not the turn. Name what could ready it first — the legend above all, whose
  text is given to you. A readied unit acts again.
- Ask what your own cards choose or target. Equipping gear to your unit chooses
  that unit, and choosing is what many abilities trigger on.

Legality:
- The RULES section below is authoritative and binding. Never recommend a play
  it forbids.
- That section is INCOMPLETE. Where it does not settle whether a play is
  legal, say so plainly — "if you can do X" — rather than assuming it is.
- Its "Observed in play" part is weaker than its rules: those lines record what
  the client was seen doing once, not when it is allowed. An action appearing
  there does not make it legal now.
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
  for (const side of [me, them]) {
    if (side.championZone.code) relevant.add(side.championZone.code);
    if (side.legendCard?.code) relevant.add(side.legendCard.code);
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
  /* Lessons ride in the USER message, not the system one: they change between
   * games, and the system prompt is where the stable things live. */
  const lessonBlock = lessons.forPrompt();
  /* The legend, with whether its ability is still available.
   *
   * It was previously just a name in the header, so its text never reached
   * the prompt and its abilities were invisible. A legend that readies a unit
   * is the difference between a body played this turn sitting idle and that
   * same body reaching a battlefield. */
  const legendLine = (side) => {
    const l = side.legendCard;
    if (!l?.name) return `  legend: ${side.legend ?? "?"}`;
    const state =
      l.exhausted === true
        ? "EXHAUSTED — its activated abilities are spent this turn"
        : l.exhausted === false
        ? "ready — its abilities are available"
        : "state unknown";
    return `  legend: ${l.name} (${state}) — see its card text; legends have abilities`;
  };

  const championLine = (side) =>
    side.championZone.available
      ? `  champion still in its zone (playable by them): ${side.championZone.name}`
      : `  champion: already deployed or not in its zone`;

  /* Your castable cards, enumerated in one place.
   *
   * The champion was previously a line under the player's name, next to their
   * score and legend — where it read as biography. Three models running at
   * three efforts all called a hand card "your only unit" with a champion
   * sitting castable in its zone. A fact in the prompt that is never used is
   * not in the prompt; it has to sit where the options are counted. */
  const playableList = (side) => {
    const rows = side.hand.map((c) => `  - ${c.name} (hand)`);
    if (side.championZone.available) {
      rows.push(
        `  - ${side.championZone.name} (CHAMPION ZONE — playable from there, rule 108.3.d)`
      );
    } else {
      /* An unread champion zone must not pass as an empty one.
       *
       * Reading it has failed twice on the live board, and while it failed the
       * models stated flatly that there was nothing to deploy — reasoning
       * confidently from a list they had no reason to doubt. An absent line is
       * indistinguishable from an absent card, so the uncertainty is said out
       * loud rather than left to be inferred from silence. */
      rows.push(
        "  ! the champion zone could not be read. If a champion is still sitting" +
          "\n    in its zone on screen it is ALSO playable from there (rule" +
          "\n    108.3.d) and this list is incomplete — check the board before" +
          "\n    concluding you have nothing to deploy."
      );
    }
    return rows.length ? rows.join("\n") : "  (nothing)";
  };

  /* Every way you could ready something this turn, enumerated.
   *
   * Prose did not work. rules.md carries a section saying exhausted is not the
   * end of a unit's turn, with a worked example naming these exact cards, and
   * the next run still said "play him to base and pass" because he enters
   * exhausted. The champion taught this lesson already: a fact in the prompt
   * that is never used is not in the prompt. It has to sit where the options
   * are counted, as a list, not as advice.
   *
   * The match is deliberately loose — any card text mentioning readying gets
   * listed, and the model decides whether it applies. A missed line costs a
   * turn; an extra row costs one line of prompt. */
  const READIES = /\bread(?:y|ies|ying)\b/i;

  const readyingBlock = () => {
    const rows = [];
    const seen = new Set();
    const add = (name, where, card) => {
      if (!card || seen.has(name)) return;
      if (!READIES.test(card.text || "")) return;
      seen.add(name);
      rows.push(`  - ${name} (${where}): ${(card.text || "").replace(/\s+/g, " ")}`);
    };

    const legend = me.legendCard;
    if (legend?.code && legend.exhausted !== true) {
      add(legend.name, "LEGEND, still ready", cardText[legend.code]);
    }
    for (const c of me.hand) add(c.name, "hand", cardText[c.code]);
    if (me.championZone.available && me.championZone.code) {
      add(me.championZone.name, "champion zone", cardText[me.championZone.code]);
    }
    for (const u of [...me.base, ...me.battlefieldA, ...me.battlefieldB]) {
      add(u.name, "on board", cardText[u.code]);
    }

    if (!rows.length) return "  (nothing you hold mentions readying)";
    return (
      rows.join("\n") +
      "\n  A unit readied mid-turn can act again — including one played this" +
      "\n  turn, which entered exhausted. Note what CHOOSES a unit: equipping" +
      "\n  gear to your own unit chooses it (818.1.b.1), and choosing is what" +
      "\n  many of these trigger on."
    );
  };

  return `TURN ${turn.number ?? "?"} (${turn.step ?? "?"}) — ${
    turn.isMyTurn === true ? "my turn" : turn.isMyTurn === false ? "their turn" : "turn owner unknown"
  }

ME — ${me.name ?? "?"}
${legendLine(me)}
  score ${me.score ?? "?"} of 8
  floating: energy ${me.floating.energy ?? "?"}, power ${me.floating.power ?? "?"}
  runes: ${describeRunes(me.runes)}
  base: ${describeUnits(me.base)}
  deck: ${me.deck.main ?? "?"} cards, rune deck ${me.deck.rune ?? "?"}

CARDS YOU CAN PLAY THIS TURN — every one of them, not just your hand:
${playableList(me)}

WAYS TO READY SOMETHING THIS TURN — check these before calling a unit spent:
${readyingBlock()}

THEM — ${them.name ?? "?"}
${legendLine(them)}
${championLine(them)}
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

${priorBlock}${lessonBlock ? `\n${lessonBlock}\n` : ""}
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
