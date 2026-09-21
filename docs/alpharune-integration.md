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

## Does the ranking actually decide anything?

Yes, above about a thousand rollouts. Same position, same decks, only the
count changing:

| rollouts | result |
|---|---|
| 40 | top four inside the noise; StandardMove happened to lead |
| 150 | top four inside the noise; a PlayCard happened to lead |
| 1200 | **CLEAR** — `PlayCard card=2` at 82.7%, separated from the next |

Five actions at 1200 rollouts is 6000 games in **79 seconds**, which is nothing
against a turn you get minutes to think about. So 1200 is the default, chosen
from the measurement rather than for comfort: below roughly a thousand this
tool honestly reports TOO CLOSE TO CALL and tells you nothing.

Passing the turn was worst at every count — 40.0%, 38.0%, 37.2% — which is the
reassuring part. The thing the engine is sure about, it has been sure about
from the first run.

## Where the card database stands

```
984 cards (OGN, OGS, SFD, UNL, VEN)   (2026-09-20)
  802 OK        usable in a search
   17 PARTIAL   the file says it is incomplete
  165 STUB      no behaviour, and its text needs some
```

Most of the stubs are VEN — imported as data by `coach/gen-cards.js` and
awaiting bodies. Both decks that ship with the engine rank in full.

Most of the movement in that number was the gate's own false positives, not
new work. It has been wrong three times, each time in the direction that
blocks a sound search:

| what it missed | cost |
|---|---|
| `applyReplacement` and 8 other virtuals | 90 cards, Guardian Angel among them |
| a card declaring itself PARTIAL | 19 counted as OK — the opposite error |
| `COVERAGE-OK`, meaning the engine handles it centrally | Rek'Sai, Breacher, which blocked a shipped deck |

The hook list is now derived from `card.h` and a test re-reads the header, so
the next missing virtual is a failing test rather than a card quietly refused.

That test has since earned itself: adding `Card::canBeCountered` to the engine
turned it red on the same commit, before the new virtual could quietly
demote any card implemented only through it.

## "This can't be countered" — a rule the engine could not express

Decree of Rage (VEN-015) reads *"This can't be countered. Deal 4 to an enemy
Calm unit."* The second half was ordinary; the first had nowhere to live.

Every counterspell in the engine reaches into `state.chain.items`, takes the
back, and pops it. None of them asks the card being countered anything — the
chain item carries a `card_def_id`, but a `CardDef` is static data with no
opinions. So the line was unrepresentable, and the card sat as a generated
stub rather than being written wrong.

What it needed, in the engine (now `engine/patches/01-engine-core.patch`):

- `Card::canBeCountered()`, defaulting to true.
- `chainItemCanBeCountered(ctx, item)` in `card_helpers.h`, which every
  counter path consults.
- `counterChainTop` returning whether it countered, so Lilting Lullaby's
  rider — *"its controller can't play spells this turn"* — is skipped when
  the counter fizzled. That one is easy to miss: the counter and the rider
  read as one sentence but are two effects, and only the first is conditional.
- `EffectExecutor::cardRegistry()`. There was a setter and a constructor
  parameter, and no getter.

The predicate **fails open** — no `CardDef`, or no registry, means "counter
it". That is not laziness: it is what every counterspell did before the
predicate existed, so the engine's own counter tests, which build
registry-less executors, pass untouched, and the only behaviour that changed
is the one card that objects. A real game always has a registry
(`GameEngine` passes `&card_registry_` at construction). The fail-open is
pinned by a test so that tightening it into a fail-closed check trips
something rather than quietly un-countering the format.

Four of the seven counterspells share `counterChainTop` and needed no edit.
The other three — Defy, Hard Bargain, Abandon — hand-roll the pop, each
differently (Defy gates on cost, Hard Bargain publishes a pay-2-to-save
choice, Abandon returns the card to hand and then predicts), so each got the
guard where its own path decides. Flurry of Feathers is a fourth shape: the
counter is one of two *modes*, so an uncounterable top makes that mode
illegal rather than a legal choice that does nothing.

## The patch set did not apply, and nothing would have noticed

`engine/patches/` exists so a re-clone of alpharune does not silently lose our
engine changes. It was not doing that job.

Each patch had been generated as `git diff <the files this feature touched>`
from a working tree that already carried the earlier features. Two of them
touched `game_engine.cpp`, so each contained the other's hunks. Applied in
order against a pristine checkout, the first went in and the second reported
`CANNOT APPLY`. Nobody ran that: `apply.sh` was only ever pointed at the
checkout the patches came from, where every patch reverse-checks as "already
applied" and the script prints a reassuring `0 applied, 3 already in.`

A green reassurance from a check that cannot fail is the same failure mode as
grepping a build that is still running.

Per-feature patches only work if each is generated against a tree that lacks
the others — a branch per feature, in a repository we do not own. So the split
is now by file role (`01-engine-core`, `02-engine-tests`), which one working
tree can produce honestly, and `scripts/regen-engine-patches.sh` regenerates
both and **applies them to a throwaway worktree at upstream HEAD before
overwriting anything**. If they do not apply clean, the old ones stay and the
script exits non-zero.

`engine/cards/install.sh` had a smaller version of the same problem: it
refused to overwrite any file that differed from its copy, to protect an
improvement made checkout-side. But a file the checkout has not modified is
upstream's pristine copy, and refusing there just meant the counterspells
carrying the `canBeCountered` guard silently did not install. It now asks git
whether the checkout actually changed the file, and only refuses when it did.

## What two real decklists changed about the plan

Zarkhil's two decks (`decks/`) are an Irelia, Blade Dancer list and a Jayce,
Defender of Tomorrow list. Every card name in both resolves against the
index. Eight cards blocked ranking:

| deck | blockers | why |
|---|---|---|
| Irelia | Up from the Deep, Twilight Shroud | Flow — both sideboard |
| Jayce | Jayce, Defender of Tomorrow (the legend), Platewyrm Egg | Empower |
| Jayce | Dredge Up (3 of them, main deck) | Flow |
| Jayce | Jayce, Brilliant Inventor; Decree of Strength; Dragon Roost | no shared mechanic |

So both mechanics recorded above as "scoped and deliberately not built" are
required by a deck actually being played — Empower by its **legend**, which
is on the board every game. That settles an open question: they are not
optional polish for set completeness, they are the difference between this
deck ranking and not.

It also shows what a decklist is for here. Nothing in the coach is
deck-specific and nothing was narrowed to these two; what the decklists did
was replace a guess about which of 162 stubs matter with a list of eight.

### A gap found on the way: activation power costs were never charged

`ActivationCost::power` has existed all along and nothing read it — not the
affordability check in `generateActivateAbilityActions`, not the payment
block in the ActivateAbility handler. Treasure Trove, Assembly Rig, Temporal
Portal and Azir, Ascendant all declare one, so their abilities were offered
and resolved **for free**.

That is the failure mode this project is most wary of, in its quietest form:
nothing errors, the ability simply costs less than the card says, and a
search ranks every line through it too highly. Found only because Defender of
Tomorrow's [Empower] costs [2][A][A] and the [A][A] would have silently
evaporated.

Now paid the way `payRepeatCost` pays: recycle an exhausted rune of a
matching domain (`Domain::Count` = rainbow), with an affordability check that
counts **exhausted** runes — power is paid by recycling one, not exhausting
one, which is the same asymmetry `coach/legality.js` got wrong once.

## One gap, found three times

Three virtuals on `Card` could not express a per-object condition, and each
was found the same way — by a card that could not be written:

| virtual | the card that found it | what it could not say |
|---|---|---|
| `canBeChosenByEnemy` | Akali, Silent | "unless I'm in combat" |
| `canActivateAbility` | Questionable Tome | "use only if not Empowered" |
| `applyPassiveAura` | Steel Paws | "[Empowered][>] I have +7 Might" |

The shape is identical every time. The hook is handed the card and the
controller but not the OBJECT, so a card whose behaviour depends on the state
of *this* copy of itself has nowhere to look — and two copies of one card
routinely differ. Each is fixed by an overload taking the object id and
defaulting to the old answer, so every existing override keeps working and
only the cards that need the distinction override the new form.

Worth stating as a pattern rather than three fixes, because the next one will
look the same: if a card's printed text contains "I" or "this" and a
condition, the hook it needs probably does not know which "I" is asking.

### Aura-granted keyword MAGNITUDES are dropped

Found while writing Shadow Fiend ("[Empowered][>] I have [Assault 3]"), and
not yet fixed.

`GameObject::AuraEffect` carries `keyword_value`, and several places in
`recalculateAuras` set it — `ae.keyword_value = 1`, `= aura.keyword_value`.
But Step 4, which aggregates `aura_effects` into the cached values, reads
only `ae.keyword`:

```cpp
if (ae.keyword != Keyword::Count) obj.aura_keywords.set(ae.keyword);
```

So an aura grants the keyword BIT and never its number. `recomputeMight`
adds `assault_value`, which an aura cannot raise, so aura-granted [Assault N]
is worth zero Might and aura-granted [Shield N] / [Deflect N] the same.

Not fixed in the same commit as the cards that found it: every existing aura
that sets `keyword_value` is currently a no-op in that respect, so making it
work changes live behaviour across cards nobody is looking at right now. It
needs its own change with its own tests, and Shadow Fiend and Serene Ascetic
wait for it rather than shipping as cards that are quietly worth less than
they read.

## Two things scoped and deliberately NOT built

Both were looked at properly and left alone, which is worth recording so the
next attempt starts from the findings rather than the idea.

### Flow (17 VEN cards)

`[Flow] <cost>` — "You may play this from your trash for its Flow cost. Then
banish it."

Most of the machinery exists. `Intent::use_alt_play_cost` is already a field,
`Card::alternativePlayCost` is already a virtual, and `canPayAdditionalCost`
already checks an alternate cost — the champion-zone play path uses all three
today. What is missing is the part that matters:

- `generateMainPhaseActions` iterates `ps.hand`. Flow needs it to iterate
  `ps.trash` as well — a **new source of legal actions**, which is the thing
  search depends on most.
- `executePlayCard` assumes the card leaves the hand, and resolution assumes it
  goes to the trash. Flow needs it to leave the trash and be **banished**.

That second point is a change to the resolution pipeline in a 4,500-line file,
and a half-right version produces exactly what `coach/fidelity.js` was built to
refuse: a card that does most of what it says. Left for a session that can
verify it against the engine's own test suite rather than by inspection.

### MCTS from a constructed position

`RiftboundState::makeFromSnapshot` is public and is what `Clone()` calls on
every MCTS decision, so searching a constructed position is possible. The
obstacle is mechanical rather than deep: OpenSpiel links into `riftbound` as
**loose object files**, not archives, so a new binary needs a CMake target in
the engine rather than a one-line `g++` against a `.a` the way `engine/rank`
is built. That means a patch that adds a target, and source inside the engine
tree.

Worth doing, but the gain is smaller than it looks: alpharune's MCTS uses a
`RandomRolloutEvaluator`, so it is tree-guided random rollouts rather than a
different kind of evaluation. `engine/rank` already separates options cleanly
at 1200 rollouts in 79 seconds, which a turn-based game can afford.

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

### VEN is imported (data), and the gate says what that is worth

`coach/gen-cards.js VEN --write` generates 197 per-card C++ `CardDef`s, adds
them to `cards/card_index.json` and extends the generated aggregator. The
engine builds clean — all 984 card objects, 1057 engine tests still passing —
and a deck containing VEN cards now loads and builds a position:

```
place P1 Akali, Silent bfA ready
-> position: 9 edit(s) applied, 0 failed
   resumed -> NeedDecision | turn 11 | 4 legal
```

What that is worth, precisely:

```
before   787 cards   661 OK   126 STUB     0 ABSENT
after    984 cards   665 OK   319 STUB     0 ABSENT
```

VEN cards move from **ABSENT to STUB**. Decks holding them load, positions
build, and the LLM coach — which reads card text from RiftScribe and never
needed the engine — works on them as before. What still does not work is
ranking a board they are on: the fidelity gate refuses, because the engine
would play them as blanks and return a percentage anyway. Bodies turn STUB
into OK card by card, and the gate opens per card as they land.

Three bugs worth recording, all found by running the importer twice:

- **Ids were "highest in use + 1"**, so a second run renumbered all 197 files
  while the aggregator still called the first run's ids. That does not link,
  and the error points nowhere near the cause. Cards are keyed by `def_id` now.
- **The index was not written.** The C++ existed and every check on our side —
  the gate, the translator, the deck checker — resolves through
  `card_index.json`, so the new cards were in the binary and invisible. It
  failed closed, so nothing broke; nothing improved either.
- **`null` is not `0`.** The engine's index writes `null` for an absent cost;
  the importer wrote `0`. So `Irelia, Fervent` (SFD-057, reprinted VEN-174)
  compared as two different cards and resolving her name became an ambiguity
  error. A reprint is the commonest thing in a card game.

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

**Costed 2026-09-20, and it is smaller than it looks.** 58 of the 163
remaining stubs mention Empower — the single largest group by a wide margin
(Flow is 16, Burn 6). Reading the engine's activated-ability API rather than
assuming:

- Multi-ability cards are already supported. `Card::activatedAbilities()`
  returns N `ActivatedAbility` descriptors and `onActivate(ctx, index,
  targets)` dispatches on the index, so `[Empower] — [exhaust]` and
  `Disempower this, [1], [exhaust]: Draw 1` on the same card need no new
  machinery. That was the part expected to be hard.
- The costs themselves are ordinary `ActivationCost`s. Nothing new.

What is actually missing is two things:

1. `bool is_empowered` on `GameObject`, carried through snapshot and clone.
2. A **per-ability, per-object** activation gate. `canActivateAbility(state,
   controller)` is card-wide and takes no object id, so it cannot answer "use
   only if not Empowered" — the card knows the rule but not which copy of
   itself is being asked about, and `ActivatedAbility` carries no legality
   predicate either.

(2) is the same shape of gap as `canBeChosenByEnemy`, and takes the same
shape of fix: an overload taking `(state, controller, self, ability_index)`
defaulting to the existing card-wide answer, so every current override keeps
working. With those two in, the 58 cards are card bodies, and a shared
`EmpowerBase` in `card_helpers.h` covers the `[Empower] <cost>` half of most
of them.

Not started, because a half-applied Empower is worse than none: a card whose
`[Empower]` ability exists but whose `[Empowered]` clause does nothing plays
as a strictly-worse card, and the search would rank around that confidently.
The gate's PARTIAL marker is the right tool if this is done incrementally.

Flow is a second engine change, and a more invasive one: it adds a new source
of legal actions, since cards in the trash become playable. The move generator
has to look somewhere it currently does not.

Burn is a card effect rather than a mechanic and needs no new engine concept —
note the engine already has `burned_out`, but that is deck-out, an unrelated
name collision.

So supporting VEN is **two engine mechanics plus ~193 card bodies**, not the
card bodies alone. Burn has since been built (`EffectExecutor::burnCards`,
in `01-engine-core.patch`), which leaves Empower and Flow.

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
