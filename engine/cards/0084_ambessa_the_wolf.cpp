#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Ambessa, The Wolf (VEN-084/166)
///
///   [Empower] [3][Body]
///   [Empowered][>] I have +3 [M] and can't be dealt damage unless I'm in
///   combat.
///
/// TWO EFFECTS, ONE GATE. The Might is an aura on herself; the immunity is a
/// flag. Both are recomputed by `recalculateAuras` from the latch, so
/// disempowering her turns both off in the same pass rather than leaving the
/// flag set — a stale immunity is invisible on the board and decides
/// combats.
///
/// "UNLESS I'M IN COMBAT" is the same clause Akali, Silent carries for
/// targeting, and it is read the same way: in a combat as attacker or
/// defender, or standing at a battlefield where one is under way. The
/// direction matters — the immunity is OUTSIDE combat, so she is a normal
/// target for combat damage and for anything that hits her while fighting.
/// A removal spell during a main phase does nothing; the same spell during
/// a showdown at her battlefield does.
class AmbessaTheWolf : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {empowerAbility({.energy = 3, .power = 1,
                                .power_domain = Domain::Body})};
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
        ae.might_bonus = 3;
        me.aura_effects.push_back(ae);

        if (!inCombat(state, me)) me.immune_to_damage = true;
    }

private:
    static bool inCombat(const GameState& state, const GameObject& me) {
        if (me.combat_designation != CombatDesignation::None) return true;
        if (!me.location.has_value()) return false;
        const auto* at = std::get_if<BattlefieldLocation>(&*me.location);
        if (!at) return false;
        for (const auto& b : state.battlefields) {
            if (b.id == at->id) return b.combat_in_progress;
        }
        return false;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 871;
        d.def_id = R"RB(ven-084-166)RB";
        d.name = R"RB(Ambessa, The Wolf)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-084/166)RB";
        d.collector_number = 84;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Body};
        d.energy_cost = 4;
        d.might = 4;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB([Empower] :rb_energy_3::rb_rune_body: (:rb_energy_3::rb_rune_body:: Empower me. Use only if not Empowered.)[Empowered][>] I have +3 :rb_might: and can't be dealt damage unless I'm in combat.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-084-166-04a650becbf9e713.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_871(CardRegistry& r) {
    r.registerCard(871, std::make_unique<AmbessaTheWolf>());
}

} // namespace riftbound
