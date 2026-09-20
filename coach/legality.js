/* A deterministic check on what the coach suggests.
 *
 * The model reasons well and forgets rules. Code does not forget. So rather
 * than hoping the rules in the prompt are followed, the suggested actions are
 * checked against the board before they ever reach the player — and a
 * violation is handed back with its reason so the model can try again.
 *
 * Grounded in the Core Rules and cross-read against chorlick/alpharune's
 * engine, whose legal-move generator says the same things in code:
 *
 *   if (unit.is_exhausted) continue;   // must be ready to move
 *   // Can always play to base (CR 355.2.a)
 *   bool can_play_here = controlled;   // battlefields: controlled only
 *
 * The rule that governs this file: NEVER flag something that might be legal.
 * A false "illegal" teaches the player to ignore the checker, which is worse
 * than missing a violation — so every check below either proves illegality
 * from the board, or stays quiet.
 */
"use strict";

const BATTLEFIELDS = { a: "A", b: "B", battlefielda: "A", battlefieldb: "B" };

/* Keywords that let a unit be played somewhere it otherwise could not. Read
 * off the card's own text, so a card that has one is never flagged. */
const PLACEMENT_KEYWORDS = /\b(ambush|hidden)\b/i;
const GANKING = /\bganking\b/i;

/** Normalise a battlefield reference: "battlefield A", "A", "Targon's Peak". */
function resolveBattlefield(text, summary) {
  const raw = (text || "").trim().toLowerCase();
  const short = raw.replace(/^battlefield\s*/, "");
  if (BATTLEFIELDS[short]) return BATTLEFIELDS[short];

  for (const key of ["A", "B"]) {
    const name = summary.battlefields?.[key]?.name;
    if (name && raw.includes(name.toLowerCase())) return key;
  }
  return null;
}

/* Parse the ACTIONS block the coach is asked to end with.
 *
 * Prose is not parsed. Asking the model to state its actions in a fixed form
 * is both far more reliable to read and better for the advice: a line it
 * cannot write down plainly is usually a line it has not thought through. */
const ACTION_RE =
  /^\s*[-*]?\s*(play|move|hide|pass)\b\s*(.*?)\s*$/i;

function parseActions(text) {
  /* [^\S\n] is "blank but not a line break": \s would let ^\s* swallow the
   * newline before the header, putting `start` a line early — and the block
   * break below would then see "ACTIONS:" itself and stop before reading a
   * single action. A parser that silently returns nothing passes every
   * illegal play, so this anchor matters more than it looks. */
  const start = (text || "").search(/^[^\S\n]*ACTIONS:[^\S\n]*$/im);
  if (start < 0) return [];

  const lines = text.slice(start).split("\n").slice(1);
  const actions = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^\s*[A-Z][A-Z ]{3,}:\s*$/.test(line)) break; // a new block started
    const hit = ACTION_RE.exec(line);
    if (!hit) continue;

    const verb = hit[1].toLowerCase();
    const rest = hit[2];
    if (verb === "pass") {
      actions.push({ verb, raw: line.trim() });
      continue;
    }

    // "<card> to <dest>" / "<card> from <origin> to <dest>"
    const to = /^(.*?)\s+(?:from\s+(.*?)\s+)?to\s+(.*)$/i.exec(rest);
    actions.push({
      verb,
      card: (to ? to[1] : rest).trim(),
      from: to?.[2]?.trim() || null,
      to: to?.[3]?.trim() || null,
      raw: line.trim(),
    });
  }
  return actions;
}

// ---------- board questions ----------

/* Units I have at a battlefield. Control is established at the end of a
 * showdown or combat (190.4) and kept while units remain (190.4.a), so having
 * none there is the one thing that definitely means no control. */
const mineAt = (summary, key) => summary.battlefields?.[key]?.mine || [];
const theirsAt = (summary, key) => summary.battlefields?.[key]?.theirs || [];

function definitelyNotControlled(summary, key) {
  return mineAt(summary, key).length === 0;
}

function controlsAnyBattlefield(summary) {
  return ["A", "B"].some((k) => !definitelyNotControlled(summary, k));
}

/** Find a named card among my units on the board, wherever it stands. */
function findMyUnit(summary, name) {
  const wanted = (name || "").toLowerCase();
  const places = [
    ["base", summary.me?.base || []],
    ["A", mineAt(summary, "A")],
    ["B", mineAt(summary, "B")],
  ];
  for (const [where, units] of places) {
    const unit = units.find((u) => (u.name || "").toLowerCase() === wanted);
    if (unit) return { unit, where };
  }
  return null;
}

function cardTextFor(name, summary, cardText) {
  const wanted = (name || "").toLowerCase();
  for (const card of Object.values(cardText || {})) {
    if ((card.name || "").toLowerCase() === wanted) return card;
  }
  // Fall back to the playable list, which carries codes.
  const inHand = (summary.me?.hand || []).find(
    (c) => (c.name || "").toLowerCase() === wanted
  );
  return inHand && cardText?.[inHand.code] ? cardText[inHand.code] : null;
}

const hasKeyword = (card, re) =>
  !!card && (re.test(card.text || "") || (card.keywords || []).some((k) => re.test(k)));

// ---------- the checks ----------

function checkPlay(action, summary, cardText) {
  const card = cardTextFor(action.card, summary, cardText);
  const dest = (action.to || "base").toLowerCase();

  if (/\bbase\b/.test(dest)) return null; // always legal (355.2.a)

  const key = resolveBattlefield(action.to, summary);
  if (!key) return null; // unrecognised destination: say nothing

  // A card that names its own placement permission is not ours to judge.
  if (hasKeyword(card, PLACEMENT_KEYWORDS)) return null;

  if (definitelyNotControlled(summary, key)) {
    return {
      rule: "806.3",
      why:
        `"${action.card}" cannot be played to battlefield ${key} — you have no ` +
        `units there, so you do not control it. A card can only be played to ` +
        `your Base or a battlefield you already control.`,
    };
  }
  return null;
}

function checkMove(action, summary) {
  const found = findMyUnit(summary, action.card);
  if (!found) return null; // not a unit we can see: no claim either way

  const { unit, where } = found;

  if (unit.exhausted === true) {
    return {
      rule: "144.2",
      why:
        `"${action.card}" is exhausted and cannot move — moving costs ` +
        `exhausting the unit, and it already is.`,
    };
  }

  const destKey = resolveBattlefield(action.to, summary);
  const toBase = /\bbase\b/i.test(action.to || "");
  const fromBattlefield = where === "A" || where === "B";

  if (fromBattlefield && destKey && destKey !== where && !toBase) {
    if (!hasKeyword(unit, GANKING)) {
      return {
        rule: "144.4.c",
        why:
          `"${action.card}" cannot move from battlefield ${where} to ` +
          `battlefield ${destKey} — battlefield-to-battlefield movement needs ` +
          `Ganking, which it does not have.`,
      };
    }
  }
  return null;
}

function checkHide(action, summary) {
  if (controlsAnyBattlefield(summary)) return null;
  return {
    rule: "811.1.b",
    why:
      `"${action.card}" cannot be hidden — Hide places a card facedown at a ` +
      `battlefield you control, and you control none.`,
  };
}

/* Check every action in an answer. Returns [] when nothing is provably
 * illegal, which includes the case where no actions could be parsed. */
function check(text, summary, cardText) {
  const violations = [];
  for (const action of parseActions(text)) {
    let v = null;
    if (action.verb === "play") v = checkPlay(action, summary, cardText);
    else if (action.verb === "move") v = checkMove(action, summary);
    else if (action.verb === "hide") v = checkHide(action, summary);
    if (v) violations.push({ ...v, action: action.raw });
  }
  return violations;
}

module.exports = {
  check,
  parseActions,
  checkPlay,
  checkMove,
  checkHide,
  resolveBattlefield,
  definitelyNotControlled,
  findMyUnit,
};
