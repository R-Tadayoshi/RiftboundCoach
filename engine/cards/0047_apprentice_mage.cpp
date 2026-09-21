#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Apprentice Mage (VEN-047/166)
///
///   [Empower] [2]
///   When I become [Empowered], [Predict 2].
///   [Empowered][>] I have +1 [M].
///
/// Three clauses and a trap. The Predict is the reason to play the card, and
/// the obvious implementation — do it inline in onActivate, right after
/// empowering itself — works for the common case and silently misses every
/// other way this unit can become Empowered: Hextech Formula, Profiteer,
/// Tornado Warrior all empower something else.
///
/// So it listens for the event instead. "When I BECOME Empowered" fires on
/// the transition only, which is already how ObjectEmpoweredEvent works —
/// re-empowering something already Empowered does nothing and emits nothing
/// (CR 441.1.c), so the Predict cannot be farmed.
///
/// Not an EmpoweredSelfBuff subclass: that base owns triggerType() for
/// nothing, but this card needs one, and the base's activatedAbilities is
/// what it would have to fight. Written out instead, which the base's own
/// comment says to do.
class ApprenticeMage : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {empowerAbility({.energy = 2})};
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, /*empower_index=*/0, {});
    }

    void onActivate(CardContext& ctx, int ability_index,
                    const std::vector<GameObjectId>&) override {
        if (ability_index == 0) empowerObject(ctx, ctx.source);
    }

    TriggerType triggerType() const override {
        return TriggerType::WhenIBecomeEmpowered;
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        ctx.executor.predict(ctx.controller, 2);
        ctx.events.logTrace("APPRENTICE MAGE: became Empowered -> [Predict 2]");
    }

    void applyPassiveAura(GameState& state, PlayerId /*controller*/,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        auto& obj = state.getObject(self);
        if (!obj.is_empowered) return;
        GameObject::AuraEffect ae;
        ae.source = self;
        ae.might_bonus = 1;
        obj.aura_effects.push_back(ae);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 834;
        d.def_id = R"RB(ven-047-166)RB";
        d.name = R"RB(Apprentice Mage)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-047/166)RB";
        d.collector_number = 47;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Mind};
        d.energy_cost = 3;
        d.might = 3;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB([Empower] :rb_energy_2: (:rb_energy_2:: Empower me. Use only if not Empowered.)When I become [Empowered], [Predict 2]. (Look at the top 2 cards of your Main Deck. Recycle any of them and put the rest back in any order.)[Empowered][>] I have +1 :rb_might:.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-047-166-f14c43c0ba9bcc53.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_834(CardRegistry& r) {
    r.registerCard(834, std::make_unique<ApprenticeMage>());
}

} // namespace riftbound
