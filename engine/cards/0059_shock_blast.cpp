#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Shock Blast (VEN-059/166)
///
///   [Action] This costs [2] less if you control something that's
///   [Empowered]. Deal 4 to a unit at a battlefield.
///
/// "SOMETHING that's [Empowered]" — not "a unit". A legend or a gear counts,
/// and both are things that carry the latch, so the discount check looks at
/// every board object you control rather than at your units.
///
/// The discount is energy only: [2] with no rune symbol, which is why this
/// card needs nothing from selfPowerCostReduction and Keeper of Law does.
///
/// "AT A BATTLEFIELD" excludes units in a base. That is the whole targeting
/// restriction and it matters: a base is where a unit is safe from this.
class ShockBlast : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    bool isActionAbility() const override { return true; }

    int selfCostReduction(const GameState& state, PlayerId player) const override {
        for (const auto& [id, obj] : state.objects) {
            if (obj.controller != player) continue;
            if (!obj.is_empowered) continue;
            if (!obj.location.has_value() && obj.zone != ZoneType::LegendZone) continue;
            return 2;
        }
        return 0;
    }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId /*controller*/) const override {
        return unitsAtBattlefields(state);
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller).empty();
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        auto legal = unitsAtBattlefields(ctx.state);
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else if (!legal.empty())
            picked = pickTarget(ctx, "Shock Blast: deal 4 to a unit at a battlefield", legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        ctx.events.logTrace("SHOCK BLAST: 4 damage to " +
                             ctx.state.getObject(picked).name);
        ctx.executor.dealDamage(picked, 4, ctx.source);
    }

private:
    static std::vector<GameObjectId> unitsAtBattlefields(const GameState& state) {
        std::vector<GameObjectId> out;
        for (const auto& [id, obj] : state.objects) {
            if (!obj.isUnit()) continue;
            if (!obj.location.has_value()) continue;
            if (!std::holds_alternative<BattlefieldLocation>(*obj.location)) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 846;
        d.def_id = R"RB(ven-059-166)RB";
        d.name = R"RB(Shock Blast)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-059/166)RB";
        d.collector_number = 59;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Mind};
        d.energy_cost = 3;
        d.power_cost = 1;
        d.rarity = Rarity::Uncommon;
        d.keywords.set(Keyword::Action);
        d.ability_text = R"RB([Action] (Play on your turn or in showdowns.)This costs :rb_energy_2: less if you control something that's [Empowered].Deal 4 to a unit at a battlefield.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-059-166-597c313b69d137a4.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_846(CardRegistry& r) {
    r.registerCard(846, std::make_unique<ShockBlast>());
}

} // namespace riftbound
