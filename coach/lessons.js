/* Lessons drawn from finished games.
 *
 * A third kind of knowledge, kept apart from the other two on purpose:
 *
 *   rules.md      quoted from the rulebook. Binding.
 *   archetypes    observed decklists. Evidence about an opponent.
 *   lessons.md    THIS. Conclusions drawn from how games actually went.
 *
 * Lessons are the weakest and the most dangerous. A rule is checkable against
 * a source; a lesson is an inference from a handful of games, drawn by the
 * same kind of model that will later read it back and treat it as knowledge.
 * So each carries where it came from, they are capped, and the prompt tells
 * the model they are heuristics rather than facts.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FILE = process.env.RBC_LESSONS || path.resolve(__dirname, "lessons.md");

/* Enough to shape play, few enough that they cannot crowd out the rules or
 * the board. Oldest go first when the cap is reached. */
const MAX_LESSONS = Number(process.env.RBC_MAX_LESSONS || 25);

const HEADER = `# Lessons from played games

Conclusions drawn from finished games, newest last. These are HEURISTICS, not
rules: each is an inference from a small number of games and may be wrong.
Where a lesson and the rules disagree, the rules win. Where a lesson and the
board disagree, the board wins.

Edit or delete any of these freely — a wrong lesson is worse than none.
`;

function load() {
  try {
    return fs.readFileSync(FILE, "utf8");
  } catch (_) {
    return "";
  }
}

/** The lesson bullets alone, without the header. */
function list() {
  return load()
    .split("\n")
    .filter((l) => l.trim().startsWith("- "))
    .map((l) => l.trim());
}

function write(lessons) {
  const kept = lessons.slice(-MAX_LESSONS);
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, `${HEADER}\n${kept.join("\n")}\n`);
  } catch (err) {
    console.error("[coach] could not write lessons:", err.message);
  }
  return kept;
}

/* The text of a lesson, without its bullet or its provenance — what two
 * lessons have to share to be the same lesson. Both ends must be stripped:
 * comparing a stored "- text (room A)" against an incoming "text" matches
 * nothing, and the same lesson accumulates once per game that teaches it. */
function key(line) {
  return line
    .trim()
    .replace(/^[-*]\s*/, "")
    .replace(/\s*\([^()]*\)\s*$/, "")
    .trim()
    .toLowerCase();
}

/* Add lessons, dropping ones already held.
 *
 * Matched on their text rather than their whole line, so the same lesson
 * learned in two games does not appear twice with different provenance. */
function add(entries, source) {
  const existing = list();
  const seen = new Set(existing.map(key));

  const fresh = [];
  for (const text of entries) {
    const clean = text.trim().replace(/^[-*]\s*/, "");
    if (!clean) continue;
    const k = key(clean);
    if (seen.has(k)) continue;
    seen.add(k);
    fresh.push(`- ${clean}${source ? ` (${source})` : ""}`);
  }

  if (!fresh.length) return { added: 0, total: existing.length };
  const kept = write([...existing, ...fresh]);
  return { added: fresh.length, total: kept.length, dropped: existing.length + fresh.length - kept.length };
}

/** For the prompt. Empty string when there is nothing worth saying. */
function forPrompt() {
  const lessons = list();
  if (!lessons.length) return "";
  return (
    "LESSONS FROM PAST GAMES — heuristics drawn from how your games actually " +
    "went, NOT rules. They may be wrong. The rules and the board both " +
    `override them:\n${lessons.join("\n")}`
  );
}

module.exports = { load, list, add, write, forPrompt, key, FILE, MAX_LESSONS, HEADER };
