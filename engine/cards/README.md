# Hand-written cards

Card implementations written by this project, kept here because the engine
checkout is not ours to push to.

**These are not patches and not generated.** `coach/gen-cards.js` produces
data-only stubs from the set cache; these are the ones someone then wrote
behaviour for. The generator leaves them alone — it looks for the marker it
puts in its own output and skips any file lacking it — but a re-clone of the
engine would lose them, which is why they live here.

Installed by `engine/cards/install.sh`, which refuses to overwrite a file that
differs from the copy here unless told to, so an improvement made in the
checkout is not silently thrown away either.

| card | why it was worth writing |
|---|---|
| Akali, Silent | the one card blocking a ranking on the board this project was built around; needed a board-aware `canBeChosenByEnemy`, see `../patches/` |
| Cloud Drake | draw 1 on play — the simplest possible trigger, written first to establish the shape |
| Field Musicians | +3 might on play, with target selection |
| Twilight Reveler | ready another friendly unit on attack — excludes itself, and only offers units that are actually exhausted |
