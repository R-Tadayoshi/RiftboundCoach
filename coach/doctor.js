#!/usr/bin/env node
/* Can this machine rank a board, and if not, exactly what is missing?
 *
 * The ranking path has a lot of links — a C++ engine built from source, a
 * patch set applied to it, an imported card set, two relinked probes, two
 * decklists, a running sidecar — and every one of them fails closed. That is
 * the right behaviour and it makes diagnosis miserable: the symptom of any
 * break is the same quiet "answering without the engine".
 *
 * So this checks each link and says which one is down, in the order they
 * depend on each other, stopping at the first thing worth fixing.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ALPHARUNE = process.env.ALPHARUNE_ROOT || path.join(ROOT, "..", "chorlick", "alpharune");

const results = [];
const ok = (name, detail) => results.push({ state: "ok", name, detail });
const warn = (name, detail, fix) => results.push({ state: "warn", name, detail, fix });
const bad = (name, detail, fix) => results.push({ state: "bad", name, detail, fix });

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 18) ok("node", `v${process.versions.node}`);
  else bad("node", `v${process.versions.node}`, "this needs Node 18 or newer (it uses global fetch)");
}

function checkSidecar() {
  const url = process.env.RBC_SIDECAR || "http://127.0.0.1:8787";
  return fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })
    .then((r) => (r.ok ? ok("sidecar", url) : warn("sidecar", `${url} answered ${r.status}`, "restart it: node sidecar/server.js")))
    .catch(() => warn("sidecar", `nothing at ${url}`,
      "start it with `node sidecar/server.js` — only needed for live capture, not for ranking a saved board"));
}

function checkEngineCheckout() {
  if (!fs.existsSync(path.join(ALPHARUNE, "src", "cards"))) {
    bad("engine checkout", `not at ${ALPHARUNE}`,
      "clone chorlick/alpharune beside this repo, or set ALPHARUNE_ROOT");
    return false;
  }
  ok("engine checkout", ALPHARUNE);
  return true;
}

function checkEngineBuild() {
  const lib = path.join(ALPHARUNE, "build", "libriftbound_core.a");
  if (!fs.existsSync(lib)) {
    bad("engine build", "libriftbound_core.a is missing",
      `cd ${ALPHARUNE} && cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release && cmake --build build`);
    return false;
  }
  ok("engine build", `${(fs.statSync(lib).size / 1e6).toFixed(0)} MB`);
  return true;
}

function checkPatches() {
  const dir = path.join(ROOT, "engine", "patches");
  const patches = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".patch")) : [];
  if (!patches.length) return ok("engine patches", "none needed");
  try {
    const out = execFileSync(path.join(dir, "apply.sh"), [], { encoding: "utf8", env: process.env });
    const applied = /(\d+) applied/.exec(out);
    if (applied && Number(applied[1]) > 0) {
      warn("engine patches", `applied ${applied[1]} that were missing`,
        `rebuild: (cd ${ALPHARUNE} && cmake --build build) && ./engine/build.sh`);
    } else {
      ok("engine patches", `${patches.length} in place`);
    }
  } catch (err) {
    bad("engine patches", (err.stderr || err.message).trim().split("\n")[0],
      "resolve by hand — see engine/patches/README.md");
    return;
  }
  checkPatchesReproduce(patches.length);
}

/* "N in place" is not the question worth asking.
 *
 * Running apply.sh against the checkout the patches were generated from is a
 * check that cannot fail: every patch reverse-checks as already applied and
 * the script cheerfully prints "0 applied, 3 already in." The patch set was
 * in exactly that state for weeks while being unable to apply to a clean
 * checkout at all — two patches touching game_engine.cpp each carried the
 * other's hunks — which is the one thing engine/patches/ exists to prevent.
 *
 * The only honest test is a tree that has none of our changes in it. So:
 * throwaway worktree at upstream HEAD, apply, report, delete.
 */
function checkPatchesReproduce(count) {
  const dir = path.join(ROOT, "engine", "patches");
  const tree = path.join(os.tmpdir(), `doctor-pristine-${process.pid}`);
  const git = (args, cwd) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    git(["worktree", "add", "--detach", tree, "HEAD"], ALPHARUNE);
  } catch (err) {
    warn("patches reproduce", "could not make a pristine worktree to test against",
      "check by hand: ./scripts/regen-engine-patches.sh");
    return;
  }
  try {
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".patch"))) {
      git(["apply", path.join(dir, f)], tree);
    }
    ok("patches reproduce", `all ${count} apply to a clean checkout`);
  } catch (err) {
    bad("patches reproduce", "they do NOT apply to a clean checkout — a re-clone would lose them",
      "./scripts/regen-engine-patches.sh");
  } finally {
    try { git(["worktree", "remove", "--force", tree], ALPHARUNE); } catch { /* best effort */ }
    fs.rmSync(tree, { recursive: true, force: true });
  }
}

/* The hand-written cards are files, not patches, and install.sh copies them
 * in. It used to refuse any file that differed from its copy — including a
 * pristine upstream file it was meant to replace — and report that refusal
 * in a line nobody read, so the cards that modify an existing upstream card
 * silently did not install. Run it and say what happened.
 */
function checkHandWrittenCards() {
  const sh = path.join(ROOT, "engine", "cards", "install.sh");
  if (!fs.existsSync(sh)) return;
  try {
    // --check, never a bare run. The doctor is a question, and npm test asks
    // it; a question that writes into the engine checkout installed three
    // cards mid-build that did not compile yet, and the build died on them.
    const out = execFileSync(sh, ["--check"], { encoding: "utf8", env: process.env });
    const m = /(\d+) copied, (\d+) already identical, (\d+) left alone/.exec(out);
    if (!m) return warn("hand-written cards", "install.sh said something unexpected", out.trim());
    const [, copied, same, left] = m;
    if (Number(copied) > 0) {
      warn("hand-written cards", `${copied} not installed (${same} already in)`,
        `./engine/cards/install.sh && (cd ${ALPHARUNE} && cmake --build build) && ./engine/build.sh`);
    } else {
      ok("hand-written cards", `${same} in place`);
    }
    if (Number(left) > 0) {
      bad("hand-written cards", `${left} differ from the checkout's copy and were left alone`,
        "compare them, then ./engine/cards/install.sh --force");
    }
  } catch (err) {
    bad("hand-written cards", (err.stdout || err.stderr || err.message).trim().split("\n").pop(),
      "see engine/cards/README.md");
  }
}

function checkProbes() {
  const missing = ["position", "rank"].filter((b) => !fs.existsSync(path.join(ROOT, "engine", b)));
  if (missing.length) {
    bad("engine probes", `missing: ${missing.join(", ")}`, "./engine/build.sh");
    return false;
  }
  /* Our probes link the engine's static library, so a rebuilt engine leaves
   * them holding the old card set — and they then report cards as unknown
   * that the engine has. Silent, and confusing enough to be worth a check. */
  const lib = path.join(ALPHARUNE, "build", "libriftbound_core.a");
  if (fs.existsSync(lib)) {
    const libTime = fs.statSync(lib).mtimeMs;
    const stale = ["position", "rank"].filter(
      (b) => fs.statSync(path.join(ROOT, "engine", b)).mtimeMs < libTime
    );
    if (stale.length) {
      bad("engine probes", `${stale.join(", ")} older than the engine library`,
        "./engine/build.sh — otherwise they hold the previous card set");
      return false;
    }
  }
  ok("engine probes", "built and current");
  return true;
}

function checkCards() {
  try {
    const { loadIndex } = require("./alpharune.js");
    const { scanCardFiles, verdictFor } = require("./fidelity.js");
    const index = loadIndex(ALPHARUNE);
    const files = scanCardFiles(ALPHARUNE);
    const counts = {};
    for (const c of index.rows) {
      const v = verdictFor(c, files).verdict;
      counts[v] = (counts[v] || 0) + 1;
    }
    const sets = new Set(index.rows.map((c) => c.set || c.set_code));
    ok("card database",
      `${index.rows.length} cards (${[...sets].sort().join(", ")}) — ` +
      `${counts.OK || 0} usable, ${(counts.STUB || 0) + (counts.PARTIAL || 0)} not`);
  } catch (err) {
    bad("card database", err.message.split("\n")[0], "see docs/adding-a-set.md");
  }
}

function checkDecks() {
  const mine = process.env.RBC_DECK_MINE;
  const theirs = process.env.RBC_DECK_THEIRS;
  if (!mine && !theirs) {
    warn("decklists", "neither set",
      "--rank needs both: --deck-mine X --deck-theirs Y, or RBC_DECK_MINE / RBC_DECK_THEIRS. " +
      "Generate theirs with coach/guess-deck.js");
    return;
  }
  for (const [label, file] of [["mine", mine], ["theirs", theirs]]) {
    if (!file) { warn(`decklist (${label})`, "not set", "--rank needs both"); continue; }
    if (!fs.existsSync(file)) { bad(`decklist (${label})`, `${file} does not exist`, "check the path"); continue; }
    try {
      const { reportDeck } = require("./fidelity.js");
      const { loadIndex } = require("./alpharune.js");
      const logs = [];
      const real = console.log;
      console.log = (...a) => logs.push(a.join(" "));
      let blocking;
      try {
        blocking = reportDeck(file, loadIndex(ALPHARUNE), require("./fidelity.js").scanCardFiles(ALPHARUNE));
      } finally { console.log = real; }
      if (blocking) {
        warn(`decklist (${label})`, `${blocking} card(s) block ranking`,
          `node coach/fidelity.js --deck ${file}`);
      } else {
        ok(`decklist (${label})`, path.basename(file));
      }
    } catch (err) {
      bad(`decklist (${label})`, err.message.split("\n")[0]);
    }
  }
}

async function main() {
  checkNode();
  await checkSidecar();
  const haveCheckout = checkEngineCheckout();
  let built = false;
  if (haveCheckout) {
    checkPatches();
    checkHandWrittenCards();
    built = checkEngineBuild();
    if (built) { checkProbes(); checkCards(); }
  }
  checkDecks();

  const mark = { ok: " ok ", warn: "warn", bad: "FAIL" };
  console.log("");
  for (const r of results) {
    console.log(`  [${mark[r.state]}] ${r.name.padEnd(20)} ${r.detail}`);
    if (r.fix) console.log(`         -> ${r.fix}`);
  }

  const bads = results.filter((r) => r.state === "bad").length;
  const warns = results.filter((r) => r.state === "warn").length;
  console.log("");
  if (bads) {
    console.log(`${bads} thing(s) stop the engine being used. The coach still works without it —`);
    console.log(`it reads card text directly — but it will not rank your options.`);
    process.exit(1);
  }
  console.log(warns ? `Ready to rank, with ${warns} note(s) above.` : "Everything is in place.");
}

if (require.main === module) main();
module.exports = { results };
