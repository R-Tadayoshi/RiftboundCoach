#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Rage Amplifier (VEN-018/166)
///
///   [Empower] [6][Fury]
///   Your units have +1 [M]. If I'm [Empowered], they have +2 [M] instead.
///
/// "INSTEAD", so +2 replaces +1 rather than stacking to +3. This is the same
/// trap Guttural Roar sets, and it matters more here: the aura applies to
/// every unit you control, so reading the clauses as cumulative inflates the
/// whole board rather than one unit.
///
/// The buff is UNGATED — a Rage Amplifier that has never been Empowered
/// still gives +1. Only the size is gated, which is why this card is not an
/// EmpoweredSelfBuff and the aura is applied unconditionally with a
/// conditional magnitude.
///
/// "YOUR units", so the controller's, not everyone's at a shared location.
class RageAmplifier : public GearCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {empowerAbility({.energy = 6, .power = 1,
                                .power_domain = Domain::Fury})};
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, /*empower_index=*/0, {});
    }

    void onActivate(CardContext& ctx, int ability_index,
                    const std::vector<GameObjectId>&) override {
        if (ability_index == 0) empowerObject(ctx, ctx.source);
    }

    void applyPassiveAura(GameState& state, PlayerId controller,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        const auto& me = state.getObject(self);
        if (!me.location.has_value()) return;
        const int bonus = me.is_empowered ? 2 : 1;

        for (auto& [id, obj] : state.objects) {
            if (obj.controller != controller) continue;
            if (!obj.isUnit()) continue;
            if (!obj.location.has_value()) continue;
            GameObject::AuraEffect ae;
            ae.source = self;
            ae.might_bonus = bonus;
            obj.aura_effects.push_back(ae);
        }
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 805;
        d.def_id = R"RB(ven-018-166)RB";
        d.name = R"RB(Rage Amplifier)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-018/166)RB";
        d.collector_number = 18;
        d.card_type = CardType::Gear;
        d.domains = {Domain::Fury};
        d.energy_cost = 4;
        d.power_cost = 1;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB([Empower] :rb_energy_6::rb_rune_fury: (:rb_energy_6::rb_rune_fury:: Empower this. Use only if not Empowered.)Your units have +1 :rb_might:. If I'm [Empowered], they have +2 :rb_might: instead.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-018-166-a8d49c0d2a331c88.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_805(CardRegistry& r) {
    r.registerCard(805, std::make_unique<RageAmplifier>());
}

} // namespace riftbound
