#!/usr/bin/env node
/* Copy a card's implementation onto its other printings.
 *
 * A card reprinted in a later set is a second entry with its own id and its
 * own C++ file. Implementing one leaves the other a data-only stub, and which
 * one a board resolves to depends on the printing that was played — so the
 * same card is usable or refused depending on which copy is on the table.
 *
 * Draven, Showboat found this the slow way: the newer printing was written
 * first and the card still read as a stub, because name resolution returns the
 * earliest printing and that one was untouched.
 *
 * This copies the class body across and keeps each file's own CardDef, which
 * is the part that legitimately differs — id, def_id, collector number, set.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { loadIndex } = require("./alpharune.js");
const { scanCardFiles, verdictFor } = require("./fidelity.js");

const ALPHARUNE =
  process.env.ALPHARUNE_ROOT || path.join(__dirname, "..", "..", "chorlick", "alpharune");

/** Printings of one card where at least one works and at least one does not. */
function mismatched(index, files) {
  const out = [];
  for (const rows of index.byName.values()) {
    if (rows.length < 2) continue;
    const ok = rows.filter((r) => verdictFor(r, files).verdict === "OK");
    const bad = rows.filter((r) => verdictFor(r, files).verdict !== "OK");
    if (ok.length && bad.length) out.push({ name: rows[0].name, from: ok[0], to: bad });
  }
  return out;
}

const fileFor = (files, card) =>
  files.has(card.id) ? path.join(ALPHARUNE, "src", "cards", files.get(card.id).file) : null;

/* A card file is: includes, a class, then its CardDef. Splitting on the
 * CardDef keeps the half that differs per printing and replaces the half that
 * should not. */
function split(src) {
  const classAt = src.search(/^class\s+\w+\s*:\s*public\s+\w+\s*\{/m);
  const defAt = src.indexOf("    const CardDef def_ = [");
  if (classAt < 0 || defAt < 0) return null;
  const head = src.slice(0, classAt);
  const cls = src.slice(classAt, defAt);
  return { head, cls, def: src.slice(defAt) };
}

function port(fromFile, toFile) {
  const from = split(fs.readFileSync(fromFile, "utf8"));
  const to = split(fs.readFileSync(toFile, "utf8"));
  if (!from || !to) return { ok: false, why: "could not split one of the files" };

  // The class name has to stay the one this file's register function uses.
  const toName = /^class\s+(\w+)/m.exec(to.cls)?.[1];
  const fromName = /^class\s+(\w+)/m.exec(from.cls)?.[1];
  if (!toName || !fromName) return { ok: false, why: "no class name" };

  const cls = from.cls.replace(new RegExp(`\\b${fromName}\\b`, "g"), toName);
  fs.writeFileSync(toFile, from.head + cls + to.def);
  return { ok: true };
}

function main() {
  const write = process.argv.includes("--write");
  const index = loadIndex(ALPHARUNE);
  const files = scanCardFiles(ALPHARUNE);
  const rows = mismatched(index, files);

  if (!rows.length) {
    console.log("Every printing of every card agrees. Nothing to port.");
    return;
  }
  console.log(`${rows.length} card(s) with one printing working and another not:\n`);

  let done = 0;
  for (const r of rows) {
    const src = fileFor(files, r.from);
    for (const target of r.to) {
      const dst = fileFor(files, target);
      console.log(`  ${r.name.padEnd(28)} ${r.from.public_code} -> ${target.public_code}`);
      if (!write) continue;
      if (!src || !dst) { console.log(`      no file for one side; skipped`); continue; }
      const res = port(src, dst);
      console.log(res.ok ? `      ported` : `      FAILED: ${res.why}`);
      if (res.ok) done += 1;
    }
  }
  if (!write) {
    console.log(`\nDry run. Pass --write to copy each implementation onto its twin.`);
  } else {
    console.log(`\n${done} ported. Rebuild and re-run coach/fidelity.js.`);
  }
}

if (require.main === module) main();
module.exports = { mismatched, port, split };
