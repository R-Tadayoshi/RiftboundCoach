#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Covert Informant (VEN-057/166)
///
///   [Empower] [3]
///   [Empowered][>] When I move, draw 1.
///
/// Every move while Empowered, not the first — nothing in the text limits
/// it, so a unit that can move twice draws twice. Compare Blade Twirler,
/// which says "the first time I move each turn" and needs the guard.
///
/// The latch is read when the trigger FIRES, not when the ability was
/// activated. A unit can be disempowered between empowering itself and
/// moving (Profiteer trades a latch away; Tomb-Raider Barbara strips one),
/// and a card that drew anyway would be drawing off a latch the board no
/// longer has.
class CovertInformant : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {empowerAbility({.energy = 3})};
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, /*empower_index=*/0, {});
    }

    void onActivate(CardContext& ctx, int ability_index,
                    const std::vector<GameObjectId>&) override {
        if (ability_index == 0) empowerObject(ctx, ctx.source);
    }

    TriggerType triggerType() const override { return TriggerType::WhenIMove; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!isEmpowered(ctx.state, ctx.source)) {
            ctx.events.logTrace("COVERT INFORMANT: moved but not [Empowered] -> no draw");
            return;
        }
        ctx.executor.drawCards(ctx.controller, 1);
        ctx.events.logTrace("COVERT INFORMANT: [Empowered] move -> drew 1");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 844;
        d.def_id = R"RB(ven-057-166)RB";
        d.name = R"RB(Covert Informant)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-057/166)RB";
        d.collector_number = 57;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Mind};
        d.energy_cost = 3;
        d.power_cost = 1;
        d.might = 4;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB([Empower] :rb_energy_3: (:rb_energy_3:: Empower me. Use only if not Empowered.)[Empowered][>] When I move, draw 1.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-057-166-eb6dba1b688ddbe5.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_844(CardRegistry& r) {
    r.registerCard(844, std::make_unique<CovertInformant>());
}

} // namespace riftbound
