#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Brittle Steel (VEN-003/166)
///
///   Kill a gear.
///   [Flow] [4][Fury]
class BrittleSteel : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    FlowCost flowCost() const override {
        return {.valid = true, .energy = 4, .power = 1, .power_domain = Domain::Fury};
    }

    bool needsPlayTimeTarget() const override { return true; }

    TargetRequirements getTargetRequirements() const override {
        return {.count = 1, .must_be_gear = true};
    }

    /// "a gear" — either side's. Killing your own is rarely right but is
    /// legal, and a checker that refuses a legal play teaches the player to
    /// ignore it.
    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isGear()) continue;
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
        else picked = pickTarget(ctx, "Brittle Steel: kill a gear",
                                 enumerateLegalTargets(ctx.state, ctx.controller));
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        ctx.events.logTrace("BRITTLE STEEL: killed " + ctx.state.getObject(picked).name);
        ctx.executor.killObject(picked);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 790;
        d.def_id = R"RB(ven-003-166)RB";
        d.name = R"RB(Brittle Steel)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-003/166)RB";
        d.collector_number = 3;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Fury};
        d.energy_cost = 2;
        d.power_cost = 1;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(Kill a gear.[Flow] :rb_energy_4::rb_rune_fury: (You may play this from your trash for its Flow cost. Then banish it.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-003-166-945f2584bab4ff63.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_790(CardRegistry& r) {
    r.registerCard(790, std::make_unique<BrittleSteel>());
}

} // namespace riftbound
