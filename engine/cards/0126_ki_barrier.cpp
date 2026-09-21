#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Ki Barrier (VEN-126/166)
///
///   [Reaction] Choose a unit. Prevent the next 7 damage that would be dealt
///   to it this turn.
///   (Opponents can assign it extra combat damage to kill it.)
///
/// A POOL of 7, not a shield against one hit. The engine already has
/// prevent_next_damage_this_turn, which prevents ONE instance however large,
/// and reaching for it is the obvious mistake — it would make Ki Barrier
/// stop a lethal hit of any size for [2][Order].
///
/// The card's own reminder text settles it: "opponents can assign it extra
/// combat damage to kill it" is only true of a pool that runs out. So a
/// 9-damage hit into a full barrier still deals 2.
///
/// "Choose a unit", not a friendly one. Barriering an enemy is almost never
/// right and is legal.
class KiBarrier : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    bool isReactionAbility() const override { return true; }
    bool needsPlayTimeTarget() const override { return true; }

    TargetRequirements getTargetRequirements() const override {
        return {.count = 1, .must_be_unit = true};
    }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || !obj.location.has_value()) continue;
            if (obj.controller != controller && obj.untargetable_by_enemy) continue;
            out.push_back(id);
        }
        return out;
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller).empty();
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else picked = pickTarget(ctx, "Ki Barrier: choose a unit",
                                 enumerateLegalTargets(ctx.state, ctx.controller));
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        // Adds to any pool already there rather than replacing it: two
        // Barriers on one unit are 14, which is what "prevent the next 7"
        // twice means.
        ctx.state.getObject(picked).damage_prevention_pool += 7;
        ctx.events.logTrace("KI BARRIER: 7-damage prevention pool on " +
                             ctx.state.getObject(picked).name);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 913;
        d.def_id = R"RB(ven-126-166)RB";
        d.name = R"RB(Ki Barrier)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-126/166)RB";
        d.collector_number = 126;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Order};
        d.energy_cost = 2;
        d.power_cost = 1;
        d.rarity = Rarity::Uncommon;
        d.keywords.set(Keyword::Reaction);
        d.ability_text = R"RB([Reaction] (Play any time, even before spells and abilities resolve.)Choose a unit. Prevent the next 7 damage that would be dealt to it this turn. (Opponents can assign it extra combat damage to kill it.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-126-166-d814a2b183499279.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_913(CardRegistry& r) {
    r.registerCard(913, std::make_unique<KiBarrier>());
}

} // namespace riftbound
