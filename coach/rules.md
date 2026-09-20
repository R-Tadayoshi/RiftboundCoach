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
  that controller already controls.** (355.2.a — "For Units, choose a valid
  Location where that Unit will enter upon being Played. By default, Valid
  locations include the controller's Base or a Battlefield the controller
  controls." Effects may add locations: 355.2.b. Reaction does not remove the
  restriction: 813.3.a.) This holds
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

## Legends have abilities

- Each player's Champion Legend sits in the **Legend Zone** all game and
  cannot normally leave it. (107.4, 133.6.b.1)
- **Legends can have passive, triggered AND activated abilities.** The legend
  in the Legend Zone is a Game Object (107.4.c), a Game Object is anything that
  can produce Game Effects (120), and the rules name "Legend Abilities"
  directly where they say which abilities can carry Action and Reaction
  (806.1.a, 813.1.a).
- Legend abilities can carry Action and Reaction. (806.1.a, 813.1.a)

**So the legend is a standing ability engine, not a nameplate**, and whether
it is exhausted is as much a resource as an untapped rune — activating an
ability usually costs exhausting it. Read the legend's card text before
concluding what a turn can do. A legend that readies a unit, for instance, is
the difference between a unit played this turn sitting idle and that same unit
reaching a battlefield.

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

## You may play units to a battlefield you control

The restriction above cuts both ways, and the coach keeps forgetting the
second half.

- Valid locations are the controller's Base **or a battlefield the controller
  controls** (355.2.a). Controlling a battlefield means having units there
  outside combat (190.4.a).
- So while you hold a battlefield, playing a new unit **directly onto it** is
  legal, and is usually better than playing it to your base: it defends what
  you already hold, and it saves the move (and the exhaust) next turn.
- An empty battlefield is **not** one you control. "There are no units there,
  so it is fine" is false.

## A unit can move more than once in a turn

- The Standard Move has no once-per-turn limit. Its only restrictions are when
  it can be performed (144.1: main phase, not in a Closed State, not during a
  showdown or combat) and where it can go (144.4).
- **Exhausting the unit is the Cost** (144.2). That, not a limit, is what
  usually stops a second move.
- So a unit that is readied again mid-turn — by a legend ability, a spell, or
  anything else — may move again. Check the legend before concluding that a
  unit cannot reach a battlefield.

## Moving into an empty battlefield is not free

This is where the coach has been confidently wrong, so it is spelled out.

- Moving or playing a unit to a battlefield makes it **Contested**, if it is
  not already and that unit's controller does not already control it.
  (190.3.a.1)
- A Showdown is **Staged** at that battlefield in the cleanup after the
  Contested status is applied. (316.8.b)
- A showdown caused by moving into an **empty** battlefield is a stand-alone
  phase and does not create a Combat — a **Non-Combat Showdown**. (316.8.b.1,
  316.8.b.1.a)
- A showdown **is a structured Window of Opportunity where players may play
  cards and activate abilities with Action or Reaction.** (316.8.c)
- During a Non-Combat Showdown, units controlled by another player **may
  become present** at that battlefield, which turns it into a Combat Showdown
  in the following cleanup. (316.8.b.1.a)
- Control is established **at the end of** the showdown. (190.4)

**So:** walking a unit into an empty battlefield does not hand you control on
the spot, and does not score on the spot. It stages a showdown, and the
showdown is a window your opponent may act in — including by moving units in
and making it a combat. Never describe such a move as "free", "uncontested",
"an instant point", or as giving the opponent no window.

## Choosing a target

- Valid choices must be made for all targets before a spell or ability goes on
  the chain (355.8), and a target is valid only if it **meets all targeting
  restrictions** (355.9.b). The rulebook's own example there: *a unit that
  reads "I can't be chosen by enemy spells or abilities" is not a valid
  target.*
- Choosing a game object is a Choice made while the card is being played
  (355.5); "Stun a unit at a battlefield" is a Choice, "Kill all gear" is not
  (355.5.a).
- A card may forbid being chosen. **Read the condition in the direction it is
  written.** "I can't be chosen by enemy spells and abilities **unless I'm in
  combat**" means it can be chosen ONLY during a combat — so outside combat it
  cannot be chosen at all. Outside combat is the restriction, not the
  exemption.
- Deflect is different and is not a prohibition: "Opponents must pay
  :rune_rainbow: to choose me with a spell or ability" is an added cost, so the
  choice is legal if the cost is paid. (822 for the keyword family.)

Before naming a target, quote the target's own restriction clause to yourself
and check which side of "unless" you are on.

## Scoring

A player scores in one of exactly two ways (469):

- **Conquer** — gaining control of a battlefield they have not yet scored this
  turn. (469.1)
- **Hold** — still controlling, during their Beginning Phase, a battlefield
  they have not yet scored this turn. (469.2)

Each battlefield scores once per turn per player.

## Paying for things

- A basic rune has two abilities: exhaust it to add 1 Energy, or recycle it to
  add 1 Power of that rune's domain (164.2, 164.2.a, 164.2.b.1).
- **One rune produces Energy or Power, never both.** A cost written as
  6 Energy + 1 Power needs **seven** runes, not six. Power in a cost is another
  rune, not a rider on the energy.
- Add up the whole line before recommending it, and say what is left standing.
  Advice to "hold up a trick" is worthless if the line already spent every
  rune — the rune pool empties anyway at the end of the turn (167, 167.1), so
  what matters is what stays ready during the opponent's turn.

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
