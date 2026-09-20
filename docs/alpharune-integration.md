# Wiring the coach to a real engine

## Why

The coach reads the board correctly, never recommends an illegal play, and
cites rules that exist. None of that makes it a coach. Nothing in the design
ranks one legal line above another — the checker says *legal*, the prompt says
*here are your options*, and neither says *better*. Zarkhil put it exactly:
"it just says one of the options I have, not what the better option is."

Ranking lines needs search, and search needs an engine that knows the cards.
`chorlick/alpharune` is a C++20 Riftbound engine with an OpenSpiel wrapper.

## What was checked, against the code rather than the README

Two of the three blockers recorded earlier in this project did not survive
reading the source.

**"No state deserializer" — false.** `src/io/state_editor.h` is a god-mode
mutation API that explicitly "bypasses engine rule validation", built for
"reproduction setups":

| method | what it sets |
|---|---|
| `moveObject` | any object to any zone, either end of a deck |
| `moveObjectToBattlefield` | a unit onto a specific battlefield |
| `setObjectExhausted` / `setObjectDamage` / `setObjectMight` | per-object state |
| `setPlayerScore` / `setPlayerEnergy` / `setPlayerPower` | per-player state |
| `setPhase` / `setTurnPlayer` | turn structure |
| `reorderMainDeck` | deck order (same multiset) |

It is already reachable over JSON: `docs/play-api.md` exposes `edit_move`,
`edit_object`, `edit_player`, `edit_phase`, `edit_reorder_deck`.

**"Card coverage" — overstated, and the evidence was stale.**
`docs/card-implementation-audit.md` is dated 2026-05-24 and lists Targon's
Peak as MISSING; the current `0284_targon_s_peak.cpp` calls `readyObject`.
The cards that decided the turns in this project are hand-written, not stubs:

- `0555_blade_dancer.cpp` — both abilities in full, including
  `WhenYouChooseAFriendlyUnit` with the exhaust-me-and-pay-`[A]` cost, target
  selection, and the separate `WhenIConquer` ready.
- `0469_draven_audacious.cpp` — both clauses, with the once-per-turn guard on
  "first combat win" and "die in combat → opponent scores 1".

The engine models the interaction the LLM needed three attempts to find.

**"Imperfect information" — real, and now the only blocker.** ISMCTS is wired,
but the resampler is a `Clone()`:

```cpp
// Minimum-viable resampler: Clone() rather than determinize hidden
// info. ... proper resampling from the unseen card pool is queued.
bot->SetResampler([](const State& st, ...) { return st.Clone(); });
```

`mcts_agent.h` says so plainly: "Currently behaves like perfect-info MCTS
because the resampler is a Clone (no hidden-info determinization yet)."

For alpharune's own self-play that is a shortcut — the engine holds both hands,
so the search cheats. **For this project it disqualifies deep search outright**,
because we do not have the opponent's hand to cheat with. A constructed
position would carry an invented opponent hand and the search would treat those
invented cards as certainties: playing around a counterspell they may not hold,
walking into one nobody imagined. Advice that is wrong *and* carries a win-rate
number is worse than no advice.

The substrate for a real resampler exists: `PlayerState.observed_cards`
(`game_state.h:203`) already records every revealed card per player, and the
seeded decklists in this repo give the opponent's likely list. Unseen pool =
their list − their trash − what has been revealed. That is the work, and it is
nobody's done work yet.

## The path in

`GameEngine::resumeFromSnapshot(GameState, ...)` resumes a game from an
arbitrary state — it initialises the subsystems and dispatches on
`state_.turn.phase`, with no setup, mulligans or replay. It supports
AwakenPhase through ExpirationStep, which includes the main phase, which is
where coaching happens.

So the shape is:

1. `beginGame()` with both decklists — gives a valid state with every card
   object constructed from the registry.
2. `StateEditor` moves those objects into the positions our snapshot describes;
   set exhausted flags, scores, rune pool, phase and turn player.
3. `resumeFromSnapshot(edited)` — engine is now live on our board.
4. `currentStep()` returns `StepResult{kind, perspective, legal}` — the legal
   `Intent`s for the player to move.
5. Clone per legal action, apply, roll out, read the score.

Every piece of that exists today.

## Staging

**Stage 1 — rank my own lines. Does not need the resampler.**
On your own turn, choosing between your own lines is close to a
perfect-information problem, and in the positions this project keeps hitting —
opponent on zero ready runes, unable to respond at all — it is exactly one.
Enumerate the legal lines, play each out, report what each one scores. That
answers "which is better" with a number, from an engine that knows all 787
cards rather than the handful hand-fed into a prompt.

The LLM's job then shrinks to explaining the engine's answer in words, which
is what LLMs are reliable at.

**Stage 2 — the resampler.** Sample the opponent's hidden cards from the unseen
pool, search across sampled worlds, and only then talk about what they might be
holding. This is where it becomes a strategic coach, and it is gated on work
that does not exist yet in any repo.

## The set gap — found while building the card mapper

`cards/card_index.json` holds 787 cards across **UNL (231), OGN (298),
SFD (234), OGS (24)**. It has **no VEN cards at all** — the engine predates
that set, which is 166 cards.

This is not abstract. Checking `decks/example-jayce.txt` against the index
leaves seven lines unresolved, and every one is VEN:

| card | code |
|---|---|
| Dragon Roost | VEN-157/166 |
| Clairvoyance | VEN-056/166 |
| Platewyrm Egg | VEN-075/166 |
| Dredge Up | VEN-049/166 |
| Decree of Strength | VEN-085/166 |
| Akali, Silent (the opponent's, turn 9) | VEN-038/166 |

So: a deck built from OGN / SFD / UNL / OGS is fully modelled. A deck touching
VEN is not, and no amount of wiring fixes that — the cards would have to be
added to the engine. `scripts/fetch_cards.py` pulls from the official gallery
and writes engine-ready JSON, and the per-card C++ is a generated aggregator,
so the path exists; it is work, not a wall.

## Names, and two rules that took finding

The mapper is `coach/alpharune.js`, and both of its rules were found by making
it fail rather than by reading documentation.

**Variant printings are not all present.** RiftScribe serves Blade Dancer as
`SFD-195`; the index holds only `SFD-246` (showcase), and there is no C++ class
for 195. An exact public-code match alone would miss a card the engine
implements perfectly. So: code, then base code, then name.

**A legend is printed with its champion tag and named without it.** RiftAtlas
shows "Irelia, Blade Dancer"; the card is "Blade Dancer". Checked: of 40
legends in the index, **none** has a comma in its name — so a leading
"Something, " on a name that otherwise misses is a tag. alpharune's own deck
files are written the long way too (`draven_test.txt` asks for "Draven,
Glorious Executioner", the card is "Glorious Executioner"), so without this
rule the checker cannot read the engine's own decks. With it, that deck maps
29 of 29 lines.

**Twenty names cover two entries each**, all cross-set reprints with identical
cost, might and text. The mapper accepts an ambiguous name only after checking
the candidates play the same, so a genuine collision would still be reported
rather than silently resolved.

## Practical constraints

- This is a CMake / Ninja / Boost / OpenSpiel C++20 build. Zarkhil is on
  Windows, so it runs as a service behind the sidecar, not on his machine.
- `StateEditor` edits are gated on `god_mode_enabled`, which the play server
  ties to "at least one seat is human". A headless coach binary uses
  `StateEditor` directly and is not subject to that gate.
- Card identity has to map both ways: our snapshot carries RiftScribe codes
  (`SFD-148`), alpharune carries its own ids plus `def_id` (`sfd-246-221`) and
  `public_code` (`SFD-246/221`). The public code is the join key.
