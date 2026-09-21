#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Baccai Witherclaw (VEN-078/166)
///
///   [Empower] [1][A][A]
///   [Empowered][>] I have +2 [M].
///   [Empowered][>][>>][Deathknell][>] Channel 2 runes exhausted.
///   (When I die while Empowered, get the effect.)
///
/// "WHILE EMPOWERED" is the gate on the Deathknell, and it is checked when
/// the unit DIES, not when it was empowered. A Witherclaw stripped by
/// Tomb-Raider Barbara or traded away by Profiteer dies for nothing, which
/// is the point of those cards.
///
/// CHANNELLED EXHAUSTED, not ready — `channelRunes(..., enter_exhausted =
/// true)`. The difference is a whole turn of energy: an exhausted rune pays
/// power now and energy only after it readies. Channelling them ready would
/// make the Deathknell worth two energy more than printed on the turn it
/// fires, which is exactly the turn it matters.
///
/// The Empower cost is two RAINBOW power symbols, so `Domain::Count`, which
/// the engine already reads as universal.
class BaccaiWitherclaw : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {empowerAbility({.energy = 1, .power = 2,
                                .power_domain = Domain::Count})};
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, /*empower_index=*/0, {});
    }

    void onActivate(CardContext& ctx, int ability_index,
                    const std::vector<GameObjectId>&) override {
        if (ability_index == 0) empowerObject(ctx, ctx.source);
    }

    void applyPassiveAura(GameState& state, PlayerId /*controller*/,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        auto& me = state.getObject(self);
        if (!me.location.has_value()) return;
        if (!me.is_empowered) return;

        GameObject::AuraEffect ae;
        ae.source = self;
        ae.might_bonus = 2;
        me.aura_effects.push_back(ae);
    }

    TriggerType triggerType() const override { return TriggerType::WhenIDie; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!isEmpowered(ctx.state, ctx.source)) {
            ctx.events.logTrace("BACCAI WITHERCLAW: died without the latch -> "
                                 "no [Deathknell]");
            return;
        }
        ctx.executor.channelRunes(ctx.controller, 2, /*enter_exhausted=*/true);
        ctx.events.logTrace("BACCAI WITHERCLAW: [Deathknell] -> channelled 2 runes "
                             "exhausted");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 865;
        d.def_id = R"RB(ven-078-166)RB";
        d.name = R"RB(Baccai Witherclaw)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-078/166)RB";
        d.collector_number = 78;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Body};
        d.energy_cost = 4;
        d.might = 4;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB([Empower] :rb_energy_1::rb_rune_rainbow::rb_rune_rainbow: (:rb_energy_1::rb_rune_rainbow::rb_rune_rainbow:: Empower me. Use only if not Empowered.)[Empowered][>] I have +2 :rb_might:.[Empowered][>][>>][Deathknell][>] Channel 2 runes exhausted. (When I die while Empowered, get the effect.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-078-166-7ce677d363515d55.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_865(CardRegistry& r) {
    r.registerCard(865, std::make_unique<BaccaiWitherclaw>());
}

} // namespace riftbound
