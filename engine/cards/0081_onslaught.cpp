#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Onslaught (VEN-081/166)
///
///   Give a unit +6 [M] this turn.
///   [Flow] [4]
///
/// "a unit", not "a friendly unit". Pumping an enemy is almost never right,
/// but it is legal, and the one board where it matters — feeding a unit into
/// a fight it then loses on your terms — is exactly the kind of line a search
/// should be allowed to find.
class Onslaught : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    FlowCost flowCost() const override { return {.valid = true, .energy = 4}; }

    bool needsPlayTimeTarget() const override { return true; }

    TargetRequirements getTargetRequirements() const override {
        return {.count = 1, .must_be_unit = true};
    }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit()) continue;
            if (!obj.location.has_value()) continue;
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
        else picked = pickTarget(ctx, "Onslaught: +6[M] this turn",
                                 enumerateLegalTargets(ctx.state, ctx.controller));
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        ctx.executor.giveTemporaryMight(picked, 6);
        ctx.events.logTrace("ONSLAUGHT: +6[M] this turn -> " +
                             ctx.state.getObject(picked).name);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 868;
        d.def_id = R"RB(ven-081-166)RB";
        d.name = R"RB(Onslaught)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-081/166)RB";
        d.collector_number = 81;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Body};
        d.energy_cost = 4;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(Give a unit +6 :rb_might: this turn.[Flow] :rb_energy_4: (You may play this from your trash for its Flow cost. Then banish it.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-081-166-b0fe7d3210065a4d.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_868(CardRegistry& r) {
    r.registerCard(868, std::make_unique<Onslaught>());
}

} // namespace riftbound
