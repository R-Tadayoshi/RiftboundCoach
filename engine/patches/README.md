# Engine patches

Changes to `chorlick/alpharune` that this project depends on. They live here
because that repository is not ours to push to, and a re-clone of it would
otherwise silently lose them — silently being the problem, since everything
downstream fails closed and would simply start refusing to rank.

**Generated cards are not patches.** The 197 VEN cards are reproduced by
`node coach/gen-cards.js VEN --write` from `state/sets/ven.json`, which is
committed. Only hand-written engine changes are kept here.

## Applying

```bash
./engine/patches/apply.sh              # or: ALPHARUNE_ROOT=... ./engine/patches/apply.sh
cd ../chorlick/alpharune && cmake --build build
cd -                     && ./engine/build.sh
```

`apply.sh` refuses to apply a patch twice and says which are already in.

## What is here and why

### `01-can-be-chosen-by-enemy-stateful.patch`

`Card::canBeChosenByEnemy()` is stateless — no `GameState`, no object id — so
a card whose protection is *conditional* cannot express it. The engine's own
source says so, in `0621_master_yi_unstoppable.cpp`:

> ENGINE GAP: canBeChosenByEnemy() is a stateless static hook (no GameState/
> XP access), so the L16-gated untargetability cannot be expressed. Left
> unimplemented.

Akali, Silent (VEN-038) has the same shape: *"I can't be chosen by enemy
spells and abilities unless I'm in combat."* She is the single card that blocks
ranking on the board this project was built around.

The patch adds an overload taking `(const GameState&, GameObjectId)`, defaulting
to the stateless answer, and has the engine call that one. Every existing
override keeps working untouched; only cards that need the board override the
new form.

Upstreamable as-is — it is additive and fixes a gap the codebase already
documents.
