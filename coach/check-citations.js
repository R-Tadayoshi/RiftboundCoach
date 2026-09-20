#!/usr/bin/env node
/* Verify every rule number in rules.md against the rulebook.
 *
 * Written because two citations were wrong and nothing noticed. "806.3" was
 * given for where a unit may be played; 806.3 is the Action keyword and says
 * nothing about placement. "174.6-174.8" was given for legend abilities; rule
 * 174 does not exist, 170 is Battlefields. Both rode in a system prompt that
 * tells the model the rules section is authoritative and binding.
 *
 * A wrong number is worse than no number. It reads as checkable, so nobody
 * checks it, and the model treats the sentence attached to it as law.
 *
 * Needs pdftotext (poppler-utils) and the rulebook at rules/*.pdf. Without
 * either it reports that it cannot check, and does not pretend to pass.
 *
 *   node coach/check-citations.js          # report
 *   node coach/check-citations.js --quiet  # exit code only
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RULES_MD = path.join(__dirname, "rules.md");

function findPdf() {
  const dir = path.join(ROOT, "rules");
  if (!fs.existsSync(dir)) return null;
  const pdf = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".pdf"));
  return pdf ? path.join(dir, pdf) : null;
}

/** The rulebook as text, or null with the reason it could not be read. */
function rulebookText() {
  const pdf = findPdf();
  if (!pdf) return { text: null, why: "no PDF under rules/" };
  try {
    return {
      text: execFileSync("pdftotext", ["-layout", pdf, "-"], {
        maxBuffer: 64 * 1024 * 1024,
      }).toString(),
      why: null,
    };
  } catch (err) {
    return {
      text: null,
      why: /ENOENT/.test(err.message)
        ? "pdftotext is not installed (apt-get install poppler-utils)"
        : err.message.split("\n")[0],
    };
  }
}

/* Every number that looks like a citation. Anchored to the forms rules.md
 * actually uses so prose numbers ("at least 40 cards") are not swept in. */
function citations(md) {
  const found = new Set();
  for (const m of md.matchAll(/\b\d{3}(?:\.\d+|\.[a-z])+\b|\((\d{3})\)/g)) {
    found.add(m[1] || m[0]);
  }
  return [...found].sort();
}

/** A rule exists if the rulebook has it at the start of a line. */
function exists(rule, text) {
  const esc = rule.replace(/\./g, "\\.");
  return new RegExp(`^\\s*${esc}\\.\\s`, "m").test(text);
}

function main() {
  const quiet = process.argv.includes("--quiet");
  const md = fs.readFileSync(RULES_MD, "utf8");
  const { text, why } = rulebookText();

  if (!text) {
    if (!quiet) {
      console.error(`Cannot check citations: ${why}.`);
      console.error("This is not a pass — the citations are simply unverified.");
    }
    process.exit(2);
  }

  const cited = citations(md);
  const missing = cited.filter((r) => !exists(r, text));

  if (!quiet) {
    console.log(`${cited.length} citations in rules.md, checked against the rulebook.`);
    for (const r of missing) console.log(`  MISSING  ${r}  — no such rule`);
  }
  if (missing.length) {
    if (!quiet) console.log(`\n${missing.length} bad citation(s).`);
    process.exit(1);
  }
  if (!quiet) console.log("All present.");
}

if (require.main === module) main();
module.exports = { citations, exists, rulebookText };
