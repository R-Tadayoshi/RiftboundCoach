# Riftbound rules the coach must respect

Hard constraints on what plays are legal. The state the extractor captures is
accurate, but a model reasoning over it without the rules will recommend plays
that cannot be made — which is worse than no advice, because it looks right.

**Nothing here is written from memory.** Each rule is recorded from a stated
source. An empty section is an admission, not an omission: a plausible-sounding
rule that turns out to be wrong does more damage than a missing one, because
the coach will state it with confidence.

To add a rule, write it here with its source. To load the official text
wholesale, see "Filling this in" at the bottom.

## Playing units

- **A unit cannot be played directly to a battlefield you do not already
  control.** Units are played to your base, and moved to a battlefield
  afterwards. Once you control a battlefield you may play a unit straight to
  it. *(Source: player, 2026-09-20, after all three models recommended playing
  Tideturner onto an uncontrolled Targon's Peak.)*

## Costs and runes

*(empty — see "Filling this in")*

## Combat and showdowns

*(empty — see "Filling this in")*

## Scoring and conquering

*(empty — see "Filling this in")*

# Observed in play — NOT verified as rules

Game-log lines seen in real captures. These describe what the client actually
did, which is evidence about the action space but is **not** a rulebook: an
action being possible once says nothing about when it is possible. The model is
told to treat this section as weaker than the rules above.

Moving and playing:

- `Played <unit> from hand to base.`
- `Moved <unit> to <battlefield>.`
- `Moved <unit> to base.`
- `Played <unit> from hand to <battlefield>.` — seen only for a battlefield
  the player already controlled, which is consistent with the rule above.
- `Moved <unit> from <battlefield> to trash.`

Costs:

- `Exhausted 1 <domain> rune.` — runes are exhausted to pay
- `Paid 2 Energy — Exhaust 2.`
- `Recycled 1 <domain> rune.`
- `Channeled 1 rune.`
- `Adjusted floating energy to N.` / `Adjusted floating power to N.`

Units:

- `Readied <unit>.` / `Exhausted <unit>.`
- `Equipped <gear> to <unit>.`

Resolution and scoring:

- `Played <spell> from hand.` then `Chain resolved: <spell>.`
- `Conquered <battlefield> and scored 1.`
- `Scored 1 at turn start. Score: 1 → 2.`
- `Drew 1 card.`

# Filling this in

Both `riftbound.gg` and `playriftbound.com` are now reachable, and both turn
out to be JavaScript shells holding no rules text. Tracing where each gets its
content:

| What | Host | Reachable |
|---|---|---|
| Riot's official Core Rules PDF | `cmsassets.rgpub.io` | no |
| riftbound.gg's rules viewer data | `api.dotgg.gg`, `static.dotgg.gg` | no |

**`cmsassets.rgpub.io`** is the one worth adding: it serves Riot's own PDF,
which is the authoritative text rather than a third party's transcription.

Failing that, the PDF can simply be downloaded in a browser and committed to
this repository, and read from there.

Until then, this file holds only what has been stated outright, and the coach
is told to say when it cannot tell whether a play is legal rather than assume.
