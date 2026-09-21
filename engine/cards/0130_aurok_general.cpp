#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Aurok General (VEN-130/166)
///
///   [Empower] [3][Order]
///   [Empowered][>] Your units that are [Empowered] have +2 [M]
///   (including me).
///
/// AN AURA OVER A CONDITION THAT MOVES. "Your units that are [Empowered]"
/// is not a set fixed when the General empowers itself — a unit empowered
/// two turns later is in it, and one disempowered by Profiteer or
/// Tomb-Raider Barbara falls out. So the membership is recomputed by
/// `recalculateAuras`, which is what `applyPassiveAura` is for, rather than
/// stamped onto anything at activation time.
///
/// "(INCLUDING ME)" is not an extra clause, it is a clarification: the
/// General is a unit you control and, by the time this aura applies at all,
/// it is Empowered. The loop picks it up with everything else, and a
/// special case for it would double the bonus.
///
/// The gate is checked on the SOURCE first. Without that, a General that had
/// been disempowered would keep buffing the rest of the board — the aura
/// would survive the latch that grants it.
class AurokGeneral : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {empowerAbility({.energy = 3, .power = 1,
                                .power_domain = Domain::Order})};
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
        if (!me.is_empowered) return;

        for (auto& [id, obj] : state.objects) {
            if (obj.controller != controller) continue;
            if (!obj.isUnit()) continue;
            if (!obj.location.has_value()) continue;
            if (!obj.is_empowered) continue;
            GameObject::AuraEffect ae;
            ae.source = self;
            ae.might_bonus = 2;
            obj.aura_effects.push_back(ae);
        }
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 917;
        d.def_id = R"RB(ven-130-166)RB";
        d.name = R"RB(Aurok General)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-130/166)RB";
        d.collector_number = 130;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Order};
        d.energy_cost = 5;
        d.might = 5;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB([Empower] :rb_energy_3::rb_rune_order: (:rb_energy_3::rb_rune_order:: Empower me. Use only if not Empowered.)[Empowered][>] Your units that are [Empowered] have +2 :rb_might: (including me).)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-130-166-4282e9aa64e43b08.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_917(CardRegistry& r) {
    r.registerCard(917, std::make_unique<AurokGeneral>());
}

} // namespace riftbound
