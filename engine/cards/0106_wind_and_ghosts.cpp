#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Wind and Ghosts (VEN-106/166)
///
///   [Action] Choose a unit at a battlefield. If it has 3 [M] or less,
///   banish it. Otherwise, return it to its owner's hand.
///
/// Always removes the unit — the size only decides how permanently. That
/// makes it answer a big threat too, which is easy to miss when reading it
/// as a small-unit banish, and it means every unit at a battlefield is a
/// legal target rather than only the small ones.
///
/// Might is re-read at resolution. A unit pumped in response to this spell
/// goes back to hand instead of being banished, which is a real and
/// deliberate line for the defender.
class WindAndGhosts : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    bool isActionAbility() const override { return true; }
    bool needsPlayTimeTarget() const override { return true; }

    TargetRequirements getTargetRequirements() const override {
        return {.count = 1, .must_be_unit = true, .must_be_at_battlefield = true};
    }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || !obj.isAtBattlefield()) continue;
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
        else picked = pickTarget(ctx, "Wind and Ghosts: a unit at a battlefield",
                                 enumerateLegalTargets(ctx.state, ctx.controller));
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        const auto& obj = ctx.state.getObject(picked);
        const std::string who = obj.name;
        if (obj.current_might <= 3) {
            ctx.events.logTrace("WIND AND GHOSTS: banished " + who);
            ctx.executor.banishObject(picked);
        } else {
            ctx.events.logTrace("WIND AND GHOSTS: returned " + who + " to hand");
            ctx.executor.bounceToHand(picked);
        }
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 893;
        d.def_id = R"RB(ven-106-166)RB";
        d.name = R"RB(Wind and Ghosts)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-106/166)RB";
        d.collector_number = 106;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Chaos};
        d.energy_cost = 3;
        d.power_cost = 1;
        d.rarity = Rarity::Uncommon;
        d.keywords.set(Keyword::Action);
        d.ability_text = R"RB([Action] (Play on your turn or in showdowns.)Choose a unit at a battlefield. If it has 3 :rb_might: or less, banish it. Otherwise, return it to its owner's hand.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-106-166-3867de68c34736ef.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_893(CardRegistry& r) {
    r.registerCard(893, std::make_unique<WindAndGhosts>());
}

} // namespace riftbound
