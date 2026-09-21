#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Mesmerize (VEN-052/166)
///
///   [Reaction] Choose one —
///     Return a friendly unit to its owner's hand.
///     Give an enemy unit -2 [M] this turn.
///
/// Two modes with nothing in common: one saves your own unit from something
/// on the chain, the other shrinks theirs. Both are Reactions, which is why
/// they share a card — it answers either kind of threat for [1][Mind].
///
/// Each mode is offered only when it has a target. A board with no friendly
/// units makes mode 0 illegal rather than a legal choice that resolves into
/// nothing, and legal_modes carries that to the picker so the agent never
/// sees a dead option.
///
/// pickMode and pickTarget reserve different resume points (3/4/5 and
/// 6/7/8), so one card may use both — which is exactly what this needs and
/// is not true of two pickTargets.
class Mesmerize : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    bool isReactionAbility() const override { return true; }

    /// Either mode's candidates, so the spell is playable when EITHER has a
    /// target. Narrowed per mode at resolution.
    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller) const override {
        auto out = friendlyUnits(state, controller);
        for (auto id : enemyUnits(state, controller)) out.push_back(id);
        return out;
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller).empty();
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>&) override {
        auto friendlies = friendlyUnits(ctx.state, ctx.controller);
        auto enemies = enemyUnits(ctx.state, ctx.controller);

        uint32_t legal = 0;
        if (!friendlies.empty()) legal |= 0b01;
        if (!enemies.empty())    legal |= 0b10;
        if (legal == 0) return;

        const int mode = pickMode(ctx, "Mesmerize", /*num_modes=*/2,
                                  {"Return a friendly unit to hand",
                                   "Give an enemy unit -2[M] this turn"},
                                  legal);
        if (mode == -1) return;   // yielded for agent input
        if (mode == -2) return;   // no legal mode

        if (mode == 0) {
            auto picked = pickTarget(ctx, "Mesmerize: return a friendly unit", friendlies);
            if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
            ctx.events.logTrace("MESMERIZE: returned " +
                                 ctx.state.getObject(picked).name + " to hand");
            ctx.executor.bounceToHand(picked);
            return;
        }

        auto picked = pickTarget(ctx, "Mesmerize: -2[M] to an enemy unit", enemies);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        ctx.executor.giveTemporaryMight(picked, -2, /*minimum=*/0);
        ctx.events.logTrace("MESMERIZE: -2[M] this turn -> " +
                             ctx.state.getObject(picked).name);
    }

private:
    static std::vector<GameObjectId> friendlyUnits(const GameState& state,
                                                   PlayerId controller) {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
            out.push_back(id);
        }
        return out;
    }

    static std::vector<GameObjectId> enemyUnits(const GameState& state,
                                                PlayerId controller) {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || obj.controller == controller) continue;
            if (!obj.location.has_value()) continue;
            if (obj.untargetable_by_enemy) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 839;
        d.def_id = R"RB(ven-052-166)RB";
        d.name = R"RB(Mesmerize)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-052/166)RB";
        d.collector_number = 52;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Mind};
        d.energy_cost = 1;
        d.power_cost = 1;
        d.rarity = Rarity::Common;
        d.keywords.set(Keyword::Reaction);
        d.ability_text = R"RB([Reaction] (Play any time, even before spells and abilities resolve.)Choose one —Return a friendly unit to its owner's hand.Give an enemy unit -2 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-052-166-50c8c79ce86bfd1d.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_839(CardRegistry& r) {
    r.registerCard(839, std::make_unique<Mesmerize>());
}

} // namespace riftbound
