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

## Proven, not assumed (`engine/probe.cpp`)

Everything above this line was reading. This runs, and it settles the one
link that was still a hope — that a board we played can be rebuilt inside the
engine and the engine will then say what is legal from there.

```
card db built
decks loaded: decks/draven_test.txt / decks/fiora_test.txt
beginGame -> NeedDecision, 3 legal action(s)
after 40 choices -> NeedDecision, turn 36, phase 7
setPlayerScore(P1, 5): ok
resumeFromSnapshot -> NeedDecision, 22 legal action(s)
P1 score: 0 before edit, 5 after resume
   legal[0] P1: EndTurn
   legal[1] P1: PlayCard card=34
   ...
```

The line that matters is the last pair: the god-mode edit **survived the
resume**, and the engine went on to generate legal actions from the edited
board. So position construction works, on two different decks, with no
changes to alpharune at all.

`engine/build.sh` compiles the probe against a built alpharune checkout. It is
deliberately not a CMake target — one file against the static library, so it
stays out of alpharune's build and survives a re-clone of it.

### What this does NOT yet show

- **Search from a constructed position.** The probe uses `GameEngine`
  directly. Search needs `RiftboundState::makeFromSnapshot`, which is public
  (line 78) and is what `Clone()` calls on every MCTS decision — so the
  machinery is there, but it has not been run from an edited state yet.
  The CLI help warns that "StateEditor god-mode edits do not participate in
  MCTS planning; the bot sees the state implied by `action_history` alone" —
  that is about the existing agent flow, which rebuilds by replay. Going in
  through `makeFromSnapshot` is the way around it, and is unproven.
- **A position built from OUR snapshot**, rather than one reached by playing
  forward. That is the mapping work: our zones and card codes onto
  `moveObject` / `moveObjectToBattlefield` / `setObjectExhausted` calls.

## The chain, end to end

All four links now run.

| step | what it does |
|---|---|
| `coach/to-position.js` | a captured board → a position script |
| `engine/position_script.h` | that script → a constructed engine position |
| `engine/position` | prints the legal moves there |
| `engine/rank` | plays each one out and ranks them |

Two things the translator does that are worth keeping:

**It refuses rather than approximates.** Every card is resolved against the
engine and checked by `coach/fidelity.js`; anything that is ABSENT or a STUB
stops the translation with a list. A position missing one card still produces
a ranking with percentages on it, and that is precisely the danger.

**It states how the constructed board differs from the real one.** Their hand
is a count and never contents — the extractor refuses to read it even when the
client renders it — so the engine holds something else, and that is printed as
a caveat rather than quietly assumed away. Same for unreadable runes and for a
capture taken on the wrong turn.

### `expect legend`

A legend cannot be placed. It comes from the deck file, set up before any edit
runs. So the position **asserts** it and a mismatch is a hard failure:

```
! expect legend P1 Blade Dancer    deck legend is "Grand Duelist",
                                   position expects "Blade Dancer"
```

This is not a formality. A legend sits in play all game and its abilities are
usually the cheapest line a player has — the two-point turn this whole project
was built around was a legend readying a unit. Rank a position whose legend is
not the one on screen and every number is about a different game.

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

## What adding a set actually costs

`coach/fetch-set.js` imports a set from RiftScribe (the official gallery that
alpharune's own `fetch_cards.py` reads is outside this environment's network
policy). `node coach/fetch-set.js VEN` pulls all 197 base printings, caches
every record so a re-run only fetches what is new, and reports how much of the
set the engine gets for free:

```
  vanilla             0   0%
  keywords-only       4   2%
  needs-behaviour   193  98%
```

That is the real number, and it is not a surprise once you look at what is
already there: of alpharune's 787 card files, **605 carry a behaviour body**
and only 182 are pure data. Writing card behaviour IS the work of supporting a
set, and alpharune has done it four times.

### VEN needs engine work, not only cards

I first wrote here that VEN introduces no new keywords. That was wrong, and
wrong in an avoidable way: I ran the scan against the set **index**, whose
records carry no `description` field at all, and read "no new keywords" out of
197 empty strings. Zarkhil, who plays the set, asked about Empowered. It is on
59 cards.

Scanned against the full records, and against the engine's `Keyword` enum read
from its own source:

| keyword | cards | what it needs |
|---|---|---|
| `[Empowered]` | 59 | a per-object state, plus abilities that apply only while it holds |
| `[Empower]` | 45 | an activated ability that sets that state, once per unit |
| `[Flow]` | 17 | playing a card **from the trash** for an alternate cost, then banishing it |
| `[Burn N]` | 8 | mill N from the top of the main deck |
| `[Stun]` | 2 | already an engine mechanic (`UnitStunnedEvent`, `WhenYouStun`) |
| `[Add N]` | 5 | rune-pool notation, not a keyword |

Empower is the big one — about 30% of the set touches it. It is a new boolean
on the object plus a keyword plus conditional ability evaluation:

```
[Empower] 2 Fury (2 Fury: Empower me. Use only if not Empowered.)
[Empowered][>] I have [Assault 3].
```

Flow is a second engine change, and a more invasive one: it adds a new source
of legal actions, since cards in the trash become playable. The move generator
has to look somewhere it currently does not.

Burn is a card effect rather than a mechanic and needs no new engine concept —
note the engine already has `burned_out`, but that is deck-out, an unrelated
name collision.

So supporting VEN is **two engine mechanics plus ~193 card bodies**, not the
card bodies alone.

`coach/fetch-set.js` now does this scan on every import, reads the keyword
enum from the engine's source rather than a copy that could go stale, and
**refuses to scan textless records** instead of returning a comfortable answer
about them.

### The fidelity gate (built: `coach/fidelity.js`)

Derived rather than asked for, since the engine offers no way to ask. A card
is trustworthy if its printed text needs no behaviour (vanilla, or only
keyword reminders) **or** its C++ file overrides a behaviour hook. Anything
else is a stub. Across the engine's 787 cards:

```
  OK       661  84%
  STUB     126  16%
  ABSENT     0   0%
```

Better than the README's "~240 manually implemented" suggests — the
auto-generated cards mostly do carry bodies.

Run against the real turn-11 board, 12 of 14 cards pass and two do not:

| card | verdict |
|---|---|
| Guardian Angel | **STUB** — `gear/0374_guardian_angel.cpp` overrides nothing |
| Akali, Silent | **ABSENT** — VEN |

The Guardian Angel result is worth noting twice: the four-month-old audit says
its death-replacement effect is unimplemented, and this gate reached the same
conclusion from the source alone. Its `[Equip]` still works, because Equip is
an engine keyword — so a search would find the equip-to-ready line and then
misplay what happens when the unit dies. Exactly the quiet kind of wrong.

### A stub is worse than a missing card

For a *search*, an unimplemented card is more dangerous than an absent one. The
engine happily plays a card whose text does nothing, so the search evaluates
lines on a board that is quietly wrong and returns a confident number anyway —
the same failure as the ISMCTS `Clone()` resampler, in a different coat.

There is no runtime way to tell. `CardDef` has no fidelity field, and only 13
of 787 card files carry any "partial implementation" note. So before the coach
trusts any search result, every card in the position has to be checked against
a list of cards known to be really implemented, and an unknown one has to stop
the search rather than colour it. That gate comes before the first number this
thing ever reports.

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
