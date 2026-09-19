/* Turns a raw snapshot into the handful of facts a coach actually reasons
 * about, so the model is not left counting cards in a JSON blob.
 *
 * Pure: a snapshot in, a summary out, no clock and no network. Everything
 * here is derived from what the extractor already established was legitimately
 * visible, so nothing in a summary can be more revealing than its snapshot.
 */
"use strict";

/** "Calm Rune" -> "Calm". Runes are named for the domain they pay. */
const RUNE_NAME_RE = /^(\w+)\s+Rune$/i;

function runeDomain(card) {
  const hit = RUNE_NAME_RE.exec(card?.name || "");
  return hit ? hit[1] : null;
}

/* What a side can still pay with this turn: runes that are not exhausted,
 * counted by domain.
 *
 * On the opponent's side this is the whole "what can they hold up" read —
 * three ready runes is three ready runes whoever is looking, and it is public
 * on the board. It is not a guess about their hand. */
function readyRunes(zone) {
  const byDomain = {};
  let ready = 0;
  let exhausted = 0;
  let unknown = 0;

  for (const card of zone?.visible || []) {
    if (card.exhausted === true) {
      exhausted += 1;
      continue;
    }
    if (card.exhausted === null) {
      // Not "ready": the board did not say, and saying it is ready would
      // invent availability the opponent may not have.
      unknown += 1;
      continue;
    }
    ready += 1;
    const domain = runeDomain(card);
    if (domain) byDomain[domain] = (byDomain[domain] || 0) + 1;
  }

  return { total: zone?.count ?? 0, ready, exhausted, unknown, byDomain };
}

/** Units standing somewhere, with whether they can still act. */
function units(zone) {
  return (zone?.visible || []).map((card) => ({
    name: card.name,
    code: card.code,
    exhausted: card.exhausted,
  }));
}

/* Cards the opponent has spent. Public — they were played and resolved — and
 * the other half of a deck-thinning read: two copies in the trash and a thin
 * deck says a lot about whether the third is still in hand. */
function knownTrash(zone) {
  const counts = new Map();
  for (const card of zone?.visible || []) {
    if (!card.name) continue;
    const key = card.code || card.name;
    const entry = counts.get(key) || { name: card.name, code: card.code, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function sideSummary(snapshot, side) {
  const zones = snapshot.zones?.[side] || {};
  const player = snapshot.players?.[side] || {};
  return {
    name: player.name,
    score: player.score,
    legend: player.legend,
    champion: player.champion,
    floating: snapshot.resources?.[side] || { energy: null, power: null },
    runes: readyRunes(zones.runeArea),
    deck: snapshot.decks?.[side] || { main: null, rune: null },
    handCount: zones.hand?.count ?? 0,
    base: units(zones.base),
    battlefieldA: units(zones.battlefieldA),
    battlefieldB: units(zones.battlefieldB),
    trash: knownTrash(zones.trash),
  };
}

/* Every card whose text the coach will need, as codes. Tokens have no code
 * and are skipped — there is nothing to look up. */
function codesToResolve(snapshot) {
  const codes = new Set();
  for (const sideZones of Object.values(snapshot.zones || {})) {
    for (const zone of Object.values(sideZones)) {
      for (const card of zone.visible || []) {
        if (card.code) codes.add(card.code);
      }
    }
  }
  return [...codes];
}

function summarize(snapshot) {
  const self = sideSummary(snapshot, "self");
  const opponent = sideSummary(snapshot, "opponent");

  return {
    turn: {
      number: snapshot.match?.turnNumber,
      step: snapshot.match?.turnStep,
      isMyTurn: snapshot.match?.isMyTurn,
      mode: snapshot.match?.mode,
    },
    battlefields: {
      A: { name: snapshot.battlefields?.battlefieldA?.name, mine: self.battlefieldA, theirs: opponent.battlefieldA },
      B: { name: snapshot.battlefields?.battlefieldB?.name, mine: self.battlefieldB, theirs: opponent.battlefieldB },
    },
    me: { ...self, hand: units(snapshot.zones?.self?.hand) },
    them: opponent,
    /* Stated rather than left implicit: the coach must not be nudged into
     * speculating about specific cards in a hand it cannot see. */
    hiddenFromMe: {
      theirHandCount: opponent.handCount,
      note: "Their hand is not visible. Reason from counts, their trash, their deck size and their ready runes — never from specific cards in hand.",
    },
    warnings: snapshot.warnings || [],
    fieldsUnread: snapshot.fieldsUnread || [],
  };
}

module.exports = { summarize, readyRunes, runeDomain, knownTrash, codesToResolve, units };
