# Engine patches

Changes to `chorlick/alpharune` that this project depends on. They live here
because that repository is not ours to push to, and a re-clone of it would
otherwise silently lose them — silently being the problem, since everything
downstream fails closed and would simply start refusing to rank.

**Generated cards are not patches.** The 197 VEN cards are reproduced by
`node coach/gen-cards.js VEN --write` from `state/sets/ven.json`, which is
committed. **Hand-written cards are not patches either** — they are whole
files in `engine/cards/`, installed by `engine/cards/install.sh`. Only changes
to the engine's own source are kept here.

## Applying

```bash
./engine/patches/apply.sh              # or: ALPHARUNE_ROOT=... ./engine/patches/apply.sh
./engine/cards/install.sh
cd ../chorlick/alpharune && cmake --build build
cd -                     && ./engine/build.sh
```

`apply.sh` refuses to apply a patch twice and says which are already in.

## Why there are two patches and not one per feature

There were four feature-named patches, and the set did not apply. Each had
been generated as `git diff <the files that feature touched>` from a working
tree that already carried the earlier features, so two patches that touched
`game_engine.cpp` each contained the other's hunks. `apply.sh` got through the
first and then reported `CANNOT APPLY` on the second, against a clean
checkout — the exact situation this directory exists to prevent, and one that
no one would have noticed until a re-clone.

Per-feature patches only work if each is generated against a tree without the
others, which means a branch per feature in a checkout we do not own. So the
split is now by **file role**, which a single working tree can produce
honestly and `apply.sh` can verify:

- `01-engine-core.patch` — `src/` engine changes
- `02-engine-tests.patch` — the matching `tests/` changes

Both are regenerated wholesale with `scripts/regen-engine-patches.sh`, which
also checks them against a pristine worktree before overwriting the old ones.
What each contains is below, since the filenames no longer say.

## What is in `01-engine-core.patch`

### Stateful `Card::canBeChosenByEnemy`

`Card::canBeChosenByEnemy()` is stateless — no `GameState`, no object id — so
a card whose protection is *conditional* cannot express it. The engine's own
source says so, in `0621_master_yi_unstoppable.cpp`:

> ENGINE GAP: canBeChosenByEnemy() is a stateless static hook (no GameState/
> XP access), so the L16-gated untargetability cannot be expressed. Left
> unimplemented.

Akali, Silent (VEN-038) has the same shape: *"I can't be chosen by enemy
spells and abilities unless I'm in combat."* She is the single card that
blocked ranking on the board this project was built around.

The patch adds an overload taking `(const GameState&, GameObjectId)`,
defaulting to the stateless answer, and has the engine call that one. Every
existing override keeps working untouched; only cards that need the board
override the new form. Upstreamable as-is — additive, and it fixes a gap the
codebase already documents.

### `Card::canBeCountered` and `chainItemCanBeCountered`

"This can't be countered" had no representation. Every counterspell reached
into `state.chain.items`, popped the top, and had no way to ask the card being
countered whether it objected — so Decree of Rage (VEN-015) could not be
written and sat as a generated stub.

`card.h` gains `virtual bool canBeCountered() const { return true; }`;
`card_helpers.h` gains `chainItemCanBeCountered(ctx, item)`, which every
counter path now consults, and `counterChainTop` returns whether it actually
countered so a rider ("…and its controller can't play spells this turn") can
be skipped when the counter fizzles.

The predicate **fails open**: a chain item with no `CardDef` has no card to
ask, and an `EffectExecutor` with no `CardRegistry` cannot ask. Both answer
"counter it", which is what every counterspell did before this existed — so
the engine's own counterspell tests, which build registry-less executors, pass
untouched. A real game always has a registry (`GameEngine` passes
`&card_registry_` at construction), so the guard is live where it matters.
`tests/cards/test_counter_spells.cpp` pins the fail-open deliberately, so that
"fixing" it into a fail-closed check trips a test rather than quietly
un-countering half the format.

`effect_executor.h` gains the `cardRegistry()` accessor the predicate needs;
there was a setter and a constructor parameter but no getter.

### Units entering ready

A flag on `GameState` plus the `game_engine.cpp` path that honours it, so a
card can enter the board unexhausted without paying an Accelerate cost.

### Burn / mill primitive

`EffectExecutor::burnCards` — put the top N of a deck into its trash. Not a
draw and not deck-out: the engine's `burned_out` flag is CR 431.2 burn-out
(an empty deck costing a point), which shares only a name. Burning the last
card does not trigger it.
