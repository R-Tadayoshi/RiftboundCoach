#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Nasus, Guardian of Knowledge (VEN-063/166)
///
///   Once each turn, when an enemy unit here dies, channel 1 rune exhausted.
///
/// Three qualifiers, and dropping any of them makes a stronger card:
///
/// "Here" — at Nasus's own battlefield. WhenAnEnemyUnitDies fires on any
/// enemy death anywhere, so this uses WhenAnEnemyUnitDiesHere, which the
/// trigger manager filters by the battlefield the unit died at. The card
/// cannot do that filtering itself: by resolution the dead unit is in the
/// trash with its location cleared.
///
/// "Once each turn" — per-object state that resets each turn, which cannot
/// be a plain counter: PlayerState::resetTurnTracking runs for the TURN
/// PLAYER only, and units die on both players' turns. So the counter is
/// stamped with its turn, the same shape as GameState::spellsPlayedThisTurn
/// and Jayce, Brilliant Inventor's gear latch. This is the third card to
/// need it.
///
/// "Exhausted" — the rune arrives spent. It is ramp for next turn, not this
/// one, and channelling it ready would hand Nasus a whole extra turn of
/// tempo he does not have.
class NasusGuardianOfKnowledge : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override {
        return TriggerType::WhenAnEnemyUnitDiesHere;
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        auto& self = ctx.state.getObject(ctx.source);
        if (!self.battlefieldId()) return;   // no "here" to speak of

        // "Here" is filtered by the trigger manager, not here: by the time
        // this resolves the dead unit is in the trash with its location
        // cleared, so the card cannot ask where it died. Only
        // UnitDiedEvent::was_at still knows, and that is the manager's.
        //
        // Written first against the dying unit's own location, this card
        // compiled, installed, and would have silently never fired.

        const int turn = ctx.state.turn.turn_number;
        if (self.card_counters["nasus_turn"] == turn &&
            self.card_counters["nasus_used"] != 0) {
            ctx.events.logTrace("NASUS, GUARDIAN OF KNOWLEDGE: already channelled this turn");
            return;
        }
        self.card_counters["nasus_turn"] = turn;
        self.card_counters["nasus_used"] = 1;

        ctx.executor.channelRunes(ctx.controller, 1, /*enter_exhausted=*/true);
        ctx.events.logTrace("NASUS, GUARDIAN OF KNOWLEDGE: channelled 1 rune exhausted");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 850;
        d.def_id = R"RB(ven-063-166)RB";
        d.name = R"RB(Nasus, Guardian of Knowledge)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-063/166)RB";
        d.collector_number = 63;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Mind};
        d.energy_cost = 5;
        d.power_cost = 1;
        d.might = 6;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB(Once each turn, when an enemy unit here dies, channel 1 rune exhausted.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-063-166-5ddb809a090094e9.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_850(CardRegistry& r) {
    r.registerCard(850, std::make_unique<NasusGuardianOfKnowledge>());
}

} // namespace riftbound
