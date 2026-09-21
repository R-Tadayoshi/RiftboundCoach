#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Baccai Reaper (VEN-009/166)
///
///   When I attack, you may pay [Fury] to give me [Assault 2] this turn.
///
/// The cost is a POWER symbol, not energy: [Fury] with no energy digit in
/// front of it. So it recycles a Fury rune rather than exhausting one, and
/// the helper it goes through is payPowerFromRunes, not payEnergyFromRunes.
/// Getting that wrong would leave the player a rune up and the search would
/// learn a line that does not exist.
///
/// The payment is checked before the offer, so the agent is never shown a
/// "you may pay [Fury]" with no Fury rune in base — and checked AGAIN at
/// execution, because confirmOptional's yes and the payment are separated
/// by an agent decision during which the board can move.
class BaccaiReaper : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<TriggerType> triggerTypes() const override {
        return {TriggerType::WhenIAttack};
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;

        const std::vector<Domain> fury = {Domain::Fury};
        const int yes = confirmOptional(
            ctx, "Baccai Reaper: pay [Fury] for [Assault 2] this turn",
            [&ctx, &fury]() {
                return ctx.state.objectExists(ctx.source) &&
                       canPayPowerFromRunes(ctx.state, ctx.controller, 1, fury);
            });
        if (yes <= 0) return;   // -1 yielded for agent input, 0 declined/illegal

        if (!payPowerFromRunes(ctx, 1, fury)) return;   // board moved; pay nothing
        ctx.executor.giveTemporaryKeyword(ctx.source, Keyword::Assault, 2);
        ctx.events.logTrace("BACCAI REAPER: paid [Fury] -> [Assault 2] this turn");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 796;
        d.def_id = R"RB(ven-009-166)RB";
        d.name = R"RB(Baccai Reaper)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-009/166)RB";
        d.collector_number = 9;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 3;
        d.power_cost = 1;
        d.might = 4;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(When I attack, you may pay :rb_rune_fury: to give me [Assault 2] this turn. (+2 :rb_might: while I'm an attacker.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-009-166-e60474dd237514e3.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_796(CardRegistry& r) {
    r.registerCard(796, std::make_unique<BaccaiReaper>());
}

} // namespace riftbound
