#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Twilight Shroud (VEN-031/166)
///
///   Give a friendly unit +1 [M] this turn. It can't be chosen by enemy
///   spells and abilities this turn.
///   [Flow] [2]
///
/// The untargetability half is why this card could not be written before this
/// project patched the engine: Card::canBeChosenByEnemy is a stateless,
/// card-level hook, and this is a this-turn effect on one OBJECT granted by a
/// different card. It rides on GameObject::untargetable_by_enemy, the same
/// per-object flag the stateful canBeChosenByEnemy overload feeds.
class TwilightShroud : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    FlowCost flowCost() const override {
        return {.valid = true, .energy = 2};
    }

    bool needsPlayTimeTarget() const override { return true; }

    TargetRequirements getTargetRequirements() const override {
        return {.count = 1, .must_be_unit = true, .must_be_friendly = true};
    }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit()) continue;
            if (obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
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
        else picked = pickTarget(ctx, "Twilight Shroud: a friendly unit",
                                 enumerateLegalTargets(ctx.state, ctx.controller));
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        ctx.executor.giveTemporaryMight(picked, 1);
        // The this-turn field, not the derived one: aura recalc rebuilds
        // untargetable_by_enemy from scratch every pass and would drop this
        // within the same turn it was paid for.
        ctx.state.getObject(picked).untargetable_by_enemy_this_turn = true;
        ctx.events.logTrace("TWILIGHT SHROUD: +1[M] and untargetable this turn -> " +
                             ctx.state.getObject(picked).name);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 818;
        d.def_id = R"RB(ven-031-166)RB";
        d.name = R"RB(Twilight Shroud)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-031/166)RB";
        d.collector_number = 31;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Calm};
        d.energy_cost = 1;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(Give a friendly unit +1 :rb_might: this turn. It can't be chosen by enemy spells and abilities this turn.[Flow] :rb_energy_2: (You may play this from your trash for its Flow cost. Then banish it.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-031-166-bf2b8d7374516e17.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_818(CardRegistry& r) {
    r.registerCard(818, std::make_unique<TwilightShroud>());
}

} // namespace riftbound
