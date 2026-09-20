# Riftbound rules the coach must respect

Constraints on what plays are legal. The state the extractor captures is
accurate, but a model reasoning over it without the rules recommends plays that
cannot be made — which is worse than no advice, because it reads as sound.

Every rule below is quoted or paraphrased from the **official Core Rules
(RUP4, last updated 2026-07-16)** with its rule number, so any of them can be
checked against the source rather than taken on trust. Nothing here is written
from memory.

This is a deliberate subset: the constraints that change what you should *do*.
It is not the rulebook, and it leaves out timing minutiae, multiplayer-only
rules and card-specific interactions.

## Where cards can be played

- **A unit can only be played to its controller's Base, or to a battlefield
  that controller already controls.** (806.3, 813.3.a — "It can only be played
  to the controlling player's base or a battlefield they control.") This holds
  for units with Action and with Reaction too; neither keyword relaxes it.
- Units are at one of two kinds of location on the board: a battlefield, or
  their base. (141.1.a.1)
- **Gear can only be played to a player's Base** unless an effect says
  otherwise. (148.1.a.1, 149.2)
- Ambush is the explicit exception for units: it reads as "I may be played to a
  battlefield where you control Units". (822.1.b)
- If an effect would play a unit to a battlefield with a staged or ongoing
  combat the unit's controller is not part of, it goes to their Base instead.
  (462.2.a)

**So: with no units anywhere, the only legal destination for a unit is your
Base.** Reaching a battlefield takes a second step, next turn at the earliest.

## Hidden

- Hidden is a prerequisite for the **Hide** discretionary action, and appears
  on spells, units and gear. (811.1, 811.1.a)
- **"While this card is in your hand or in your Champion Zone on your turn
  during an Open State, you may pay [A] to hide this facedown at a battlefield
  you control that doesn't already have a facedown card hidden there."**
  (811.1.b)
- Hiding is **not** playing, and does not open a chain. Playing a card *from*
  hidden does. (811.1.c.1, 811.1.c.2, 811.1.c.3)
- A hidden permanent must be played to **that** battlefield — the one it was
  hidden at — which overrides gear's normal base-only restriction.
  (811.1.d, 811.1.d.1, 811.1.d.1.a)

**So Hide needs a battlefield you already control.** With none, hiding is not
an option this turn, however attractive the cost looks. Note also that a card
in the **Champion Zone** can be hidden from there, not only from hand.

## Units enter exhausted

- **"Units enter the Board exhausted."** (143.4) This can be altered by
  Accelerate or a similar effect (143.4.a, 805), or by a card that says it
  enters ready.
- The same holds wherever it lands: "If it is a Unit, it enters the Board
  exhausted at the Location that was chosen." (359.2.c)
- **Non-unit gear is the exception — it enters ready, at its controller's
  Base.** (359.2.d)

**So a unit played this turn cannot move this turn**, because moving costs
exhausting it (144.2) and it is already exhausted. A body played now is
available from your next turn, not this one.

## The champion is a card you can play

- Each player has a **Champion Zone** holding their Chosen Champion at the
  start of the game. (108.3, 108.3.b)
- **"The Chosen Champion can be played from here as normal, following the
  rules of Playing a Card."** (108.3.d)
- It cannot be put back there by normal means. (108.3.c)

**So a champion sitting in its zone is an available play, not scenery.** If
the board state says the champion zone could not be read, treat the list of
playable cards as incomplete rather than complete — do not conclude there is
nothing to deploy. When
the board state says the champion zone is occupied, that card is castable this
turn on the same terms as anything in hand — and it is often the strongest
play available. When the zone is empty the champion has already been deployed
and is somewhere on the board.

## Moving units

- Moving is an inherent ability of every unit, and **exhausting the unit is
  the cost**. (144, 144.2)
- It can only be done **during your own Main Phase** (144.1.a), never in a
  Closed State (144.1.b), and **never during a showdown or combat**
  (144.1.c).
- Legal standard moves: Base → battlefield (144.4.a), battlefield → Base
  (144.4.b). **Battlefield → battlefield requires Ganking.** (144.4.c.1)
- A unit cannot move to a battlefield that already has units from two other
  players, or where a combat with two other players is ongoing. (144.4.a.1)

**So an exhausted unit cannot move**, and a unit that moves becomes exhausted.

## Controlling a battlefield

- Control is established by **having units at a battlefield at the end of a
  showdown or combat**, after contested status is applied. (190.4)
- Outside combat, a player keeps control for as long as they have units there.
  (190.4.a)
- A player with **no units** at a battlefield loses control at the next
  cleanup, unless a combat or showdown is ongoing there. (190.4.c)
- Moving or playing a unit to a battlefield makes it **Contested**, if it is
  not already and that unit's controller does not already control it.
  (190.3.a.1)
- While a combat or showdown is ongoing, control cannot change except as the
  combat's own steps instruct. (190.4.b)

## Scoring

A player scores in one of exactly two ways (469):

- **Conquer** — gaining control of a battlefield they have not yet scored this
  turn. (469.1)
- **Hold** — still controlling, during their Beginning Phase, a battlefield
  they have not yet scored this turn. (469.2)

Each battlefield scores once per turn per player.

## Runes, energy and power

- The rune deck is **exactly 12 runes**. (161.2.a)
- A basic rune has exactly two abilities (164.2):
  - **Exhaust it → add 1 Energy.** (164.2.a)
  - **Recycle it → add 1 Power of that rune's domain.** (164.2.b, 164.2.b.1)
- **Energy pays numeric costs and has no domain.** (163.1, 163.1.a)
  **Power pays domain costs and has one.** (163.2, 163.2.a)
- Energy and power sit in the **Rune Pool** — this is what the board shows as
  FLOATING. (166)
- **The rune pool empties at the start of each player's Main Phase and at the
  end of each player's turn; anything unspent is lost.** (167, 167.1)

**So a ready rune is worth either 1 Energy or 1 domain Power, not both**, and
floating resources cannot be saved for a future turn.

# Observed in play — NOT verified as rules

Game-log lines seen in real captures. These describe what the client did, which
is evidence about the action space but is **not** a rulebook: an action being
possible once says nothing about when it is possible. Treat this section as
weaker than the rules above.

- `Played <unit> from hand to base.` / `Played <unit> from hand to <battlefield>.`
- `Moved <unit> to <battlefield>.` / `Moved <unit> to base.`
- `Moved <unit> from <battlefield> to trash.`
- `Exhausted 1 <domain> rune.` / `Recycled 1 <domain> rune.` / `Channeled 1 rune.`
- `Paid 2 Energy — Exhaust 2.`
- `Adjusted floating energy to N.` / `Adjusted floating power to N.`
- `Readied <unit>.` / `Exhausted <unit>.` / `Equipped <gear> to <unit>.`
- `Played <spell> from hand.` then `Chain resolved: <spell>.`
- `Conquered <battlefield> and scored 1.` / `Scored 1 at turn start. Score: 1 → 2.`

<!-- human-only: nothing below this line is sent to the model -->

# Source and maintenance

*(Maintenance notes. Not sent to the coach — provenance and upkeep are for
whoever edits this file, and every token spent on them would be spent again on
every turn of every game.)*

Distilled from `rules/Riftbound Core Rules RUP4.pdf` (120 pages, 2026-07-16),
which is in this repository because the sites hosting the rules are JavaScript
shells and the hosts serving their content — `cmsassets.rgpub.io`,
`api.dotgg.gg`, `static.dotgg.gg` — are not reachable from the build
environment.

The PDF is a working input, not part of the tool: this file is what the coach
reads. Keep the PDF if you want the constraints extended; it is 41 MB, so drop
it if you would rather not carry it.

To add a rule, quote it with its number. An empty area is an admission rather
than an omission — a plausible-sounding wrong rule does more damage than a
missing one, because the coach states both with the same confidence.
