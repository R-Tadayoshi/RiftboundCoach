# Execution Instructions

- You are operating in fully autonomous mode.
- NEVER pause at the end of a response to say what you did or ask "Should I continue?" unless you hit a blocking error or need credentials.
- If a task has multiple steps, automatically execute step after step without waiting for user prompt or confirmation.
- Keep output concise and focus strictly on executing actions.

## One exception, and why

Report a finding that changes what the project *is*, then keep working. Do not
stop for approval — state it and continue.

This is not a licence to narrate. It exists because the most valuable moments
in this project were corrections that only happened because something got said
out loud:

- "VEN introduces no new keywords" was wrong. Empowered is on 59 cards. It was
  caught because the claim was stated, and Zarkhil plays the set.
- "One rune produces Energy or Power, never both" was wrong, and had been
  written into the rules the coach treats as binding. Zarkhil caught it.

A silent agent would have shipped both. So: surface the finding in a line or
two, and carry on in the same response.

# What this project is

A live game-state extractor for RiftAtlas feeding a coach for solo practice.
Four parts:

- `extension/` — Chrome MV3 extension reading the board from the DOM.
- `sidecar/` — loopback HTTP server holding the latest snapshot.
- `coach/` — summarise, prompt, ask an LLM, check the answer's legality.
- `engine/` — a bridge to `chorlick/alpharune`, a C++ Riftbound engine, for
  ranking moves rather than merely listing them.

# The rule everything here follows

**Never emit a confident answer built on something unverified.** Every
component that survived was shaped by that:

- The extractor reads the DOM, so an opponent's hidden cards are structurally
  absent rather than filtered out.
- `coach/legality.js` never flags something that *might* be legal — a false
  "illegal" teaches the player to ignore the checker.
- `coach/check-citations.js` verifies every rule number against the PDF,
  because two were fabricated and rode in a prompt calling them binding.
- `coach/fidelity.js` blocks a search over any card the engine has as a stub,
  because a stub plays as a blank and the search still returns a percentage.
- `engine/rank.cpp` reports TOO CLOSE TO CALL when the top options sit inside
  the noise, because at 40 rollouts one option led and at 150 another did.

When in doubt, refuse and say why. A missing answer costs a turn; a confident
wrong one costs trust in every answer after it.

# Working notes

- `npm test` must be green before a commit. Tests that need the engine
  checkout skip *loudly* — unverified is not the same as passing.
- `docs/alpharune-integration.md` holds what was checked against alpharune's
  source rather than its README. Two of three "blockers" recorded early were
  wrong on inspection; check the code, not the docs, and note the date on
  anything generated (`card-implementation-audit.md` is months stale).
- Card naming has bitten three times: variant printings differ between
  RiftScribe and the engine, and a legend is *printed* with its champion tag
  ("Irelia, Blade Dancer") and *named* without it ("Blade Dancer").
- Never write one deck's card names into the prompt or rules. Tests assert
  they are absent.
