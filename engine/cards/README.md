# Hand-written cards

Card implementations written by this project, kept here because the engine
checkout is not ours to push to.

**These are not patches and not generated.** `coach/gen-cards.js` produces
data-only stubs from the set cache; these are the ones someone then wrote
behaviour for. The generator leaves them alone — it looks for the marker it
puts in its own output and skips any file lacking it — but a re-clone of the
engine would lose them, which is why they live here.

Installed by `engine/cards/install.sh`, which refuses to overwrite a file the
**checkout itself has modified**, so an improvement made there is not silently
thrown away either. It asks git that question rather than comparing bytes: an
earlier version refused on any difference, which meant a card written here to
replace an existing upstream card never installed at all, and said so only in
a line of output nobody read. `--force` still overrides.

| card | why it was worth writing |
|---|---|
| Akali, Silent | the one card blocking a ranking on the board this project was built around; needed a board-aware `canBeChosenByEnemy`, see `../patches/` |
| Cloud Drake | draw 1 on play — the simplest possible trigger, written first to establish the shape |
| Field Musicians | +3 might on play, with target selection |
| Twilight Reveler | ready another friendly unit on attack — excludes itself, and only offers units that are actually exhausted |
| Decree of Rage | "This can't be countered" — the card that needed `Card::canBeCountered`, see `../patches/` |
| Crumbling Sands | counters only if an opponent already played a spell this turn; needed a per-player spell count that is stamped with its turn |
| Shadow Assassin | "a card with my name in your trash" — matched by printed name, because a reprint shares the name and nothing else |
| Defy, Hard Bargain, Abandon, Flurry of Feathers, Lilting Lullaby | existing upstream counterspells, each hand-rolling its own chain pop, taught to ask `canBeCountered` first |
