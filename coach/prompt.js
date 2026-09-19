/* Builds the coaching request.
 *
 * The summary is already reduced to the facts that matter, so this file's job
 * is to say what kind of advice is wanted and, just as importantly, what the
 * model must not do: invent cards in a hand nobody can see.
 */
"use strict";

const SYSTEM = `You are a Riftbound coach sitting beside a player during solo practice.
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
- If you are given PREVIOUSLY SEEN cards for their champion, treat it as a
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
- Be brief. Six sentences at most, no preamble, no restating the board.`;

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
      return `${u.name} (${state})`;
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

function describePrior(prior) {
  if (!prior) return "";
  const lines = prior.cards
    .slice(0, 14)
    .map((c) => `  - ${c.name} (seen in ${c.seen} of ${c.of})`)
    .join("\n");
  return `\nPREVIOUSLY SEEN FROM ${prior.champion.toUpperCase()} — across ${
    prior.matchesPlayed
  } past game(s), public cards only. A prior, not their list:\n${lines}\n`;
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
  buildUserMessage,
  describeRunes,
  describeUnits,
  describeHand,
  describeCard,
  describePrior,
};
