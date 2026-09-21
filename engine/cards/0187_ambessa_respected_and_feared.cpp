#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Ambessa, Respected and Feared (VEN-136/166)
///
///   [Empower] [1][Order][Order]
///   [Empowered][>] I have [Assault 2].
///   [Empowered][>] When I attack, kill an enemy unit here with less Might
///   than me.
///
/// TWO GATED CLAUSES, ONE LATCH. The Assault is an aura on herself with a
/// MAGNITUDE — `keyword_value`, not just `keyword`, because an aura-granted
/// [Assault 2] with no value is worth zero Might. That was a real engine bug
/// and is why `aura_assault_value` exists.
///
/// "LESS MIGHT THAN ME" is read at trigger time, WITH the Assault already
/// counted: she is attacking, so her [Assault 2] is live and the comparison
/// is against 7, not 5. Strictly less — a unit of equal Might survives.
///
/// "AN ENEMY UNIT HERE" is the battlefield she is attacking, so the kill is
/// a choice among the defenders and not a board sweep. Not optional: the
/// text says kill, so if a legal target exists one dies. The choice of WHICH
/// is the player's, which is why this publishes a target rather than picking
/// the biggest that still qualifies.
class AmbessaRespectedAndFeared : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {empowerAbility({.energy = 1, .power = 2,
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

    void applyPassiveAura(GameState& state, PlayerId /*controller*/,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        auto& me = state.getObject(self);
        if (!me.location.has_value()) return;
        if (!me.is_empowered) return;

        GameObject::AuraEffect ae;
        ae.source = self;
        ae.keyword = Keyword::Assault;
        ae.keyword_value = 2;
        me.aura_effects.push_back(ae);
    }

    TriggerType triggerType() const override { return TriggerType::WhenIAttack; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        if (!isEmpowered(ctx.state, ctx.source)) {
            ctx.events.logTrace("AMBESSA, RESPECTED AND FEARED: attacked but not "
                                 "[Empowered] -> no kill");
            return;
        }

        auto legal = smallerEnemiesHere(ctx.state, ctx.controller, ctx.source);
        if (legal.empty()) {
            ctx.events.logTrace("AMBESSA, RESPECTED AND FEARED: no enemy unit here "
                                 "with less Might");
            return;
        }
        auto picked = pickTarget(
            ctx, "Ambessa, Respected and Feared: kill an enemy unit here with less Might",
            legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        ctx.events.logTrace("AMBESSA, RESPECTED AND FEARED: killed " +
                             ctx.state.getObject(picked).name);
        ctx.executor.killObject(picked);
    }

private:
    static std::vector<GameObjectId> smallerEnemiesHere(const GameState& state,
                                                         PlayerId controller,
                                                         GameObjectId self) {
        std::vector<GameObjectId> out;
        if (!state.objectExists(self)) return out;
        const auto& me = state.getObject(self);
        const auto here = me.battlefieldId();
        if (!here) return out;

        for (const auto& [id, obj] : state.objects) {
            if (id == self) continue;
            if (!obj.isUnit()) continue;
            if (obj.controller == controller) continue;
            const auto bf = obj.battlefieldId();
            if (!bf || *bf != *here) continue;
            if (obj.current_might >= me.current_might) continue;
            if (obj.untargetable_by_enemy || obj.untargetable_by_enemy_this_turn) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 974;
        d.def_id = R"RB(ven-187-166)RB";
        d.name = R"RB(Ambessa, Respected and Feared)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-187/166)RB";
        d.collector_number = 187;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Order};
        d.energy_cost = 5;
        d.might = 5;
        d.rarity = Rarity::Epic;
        d.ability_text = R"RB([Empower] :rb_energy_1::rb_rune_order::rb_rune_order:[Empowered][>] I have [Assault 2].[Empowered][>] When I attack, kill an enemy unit here with less Might than me.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-187-166-f86db5af1f218c59.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_974(CardRegistry& r) {
    r.registerCard(974, std::make_unique<AmbessaRespectedAndFeared>());
}

} // namespace riftbound
