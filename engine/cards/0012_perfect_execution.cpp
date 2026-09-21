#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Perfect Execution (VEN-012/166)
///
///   Ready a unit and give it [Assault 3] this turn.
///   [Flow] [3][Fury]
///
/// Both halves land on the same unit, and the ready is the half that decides
/// whether the card is worth playing — [Assault 3] on a unit that cannot
/// attack this turn is nothing. So a unit that is already ready is still a
/// legal target (the Assault alone can be the point), but an exhausted one
/// is what the card is for.
class PerfectExecution : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    FlowCost flowCost() const override {
        return {.valid = true, .energy = 3, .power = 1, .power_domain = Domain::Fury};
    }

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
        else picked = pickTarget(ctx, "Perfect Execution: ready a unit, [Assault 3]",
                                 enumerateLegalTargets(ctx.state, ctx.controller));
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        ctx.executor.readyObject(picked);
        ctx.executor.giveTemporaryKeyword(picked, Keyword::Assault, 3);
        ctx.events.logTrace("PERFECT EXECUTION: readied + [Assault 3] -> " +
                             ctx.state.getObject(picked).name);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 799;
        d.def_id = R"RB(ven-012-166)RB";
        d.name = R"RB(Perfect Execution)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-012/166)RB";
        d.collector_number = 12;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Fury};
        d.energy_cost = 3;
        d.power_cost = 1;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(Ready a unit and give it [Assault 3] this turn. (+3 :rb_might: while it's an attacker.)[Flow] :rb_energy_3::rb_rune_fury: (You may play this from your trash for its Flow cost. Then banish it.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-012-166-ce2d5033cbb2b3a1.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_799(CardRegistry& r) {
    r.registerCard(799, std::make_unique<PerfectExecution>());
}

} // namespace riftbound
