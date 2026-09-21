#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Lacerate (VEN-127/166)
///
///   Choose a unit. If it's [Empowered], disempower it. Then kill it if it
///   has 3 [M] or less.
///   [Flow] [4][Order][Order]
///
/// Read the order: disempower FIRST, then check Might. On a unit whose
/// Empowered buff is what carries it above 3 — Punching Poro, Kinkou
/// Lifeblade, half the VEN unit cycle — stripping the latch is what brings
/// it into range, and checking Might first would make the card miss exactly
/// the targets it is printed to answer.
///
/// "Then kill it if …" is conditional, not a cost: disempowering a 6-Might
/// unit and killing nothing is a legal, sometimes correct play, so a unit
/// above the threshold is still a legal target.
class Lacerate : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    FlowCost flowCost() const override {
        return {.valid = true, .energy = 4, .power = 2, .power_domain = Domain::Order};
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
        else picked = pickTarget(ctx, "Lacerate: choose a unit",
                                 enumerateLegalTargets(ctx.state, ctx.controller));
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        disempowerObject(ctx, picked);   // before the Might check, as printed

        auto& obj = ctx.state.getObject(picked);
        if (obj.current_might > 3) {
            ctx.events.logTrace("LACERATE: " + obj.name + " survives at " +
                                 std::to_string(obj.current_might) + "[M]");
            return;
        }
        ctx.events.logTrace("LACERATE: killed " + obj.name);
        ctx.executor.killObject(picked);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 914;
        d.def_id = R"RB(ven-127-166)RB";
        d.name = R"RB(Lacerate)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-127/166)RB";
        d.collector_number = 127;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Order};
        d.energy_cost = 2;
        d.power_cost = 1;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(Choose a unit. If it's [Empowered], disempower it. Then kill it if it has 3 :rb_might: or less.[Flow] :rb_energy_4::rb_rune_order::rb_rune_order: (You may play this from your trash for its Flow cost. Then banish it.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-127-166-4421bd0081e10f4a.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_914(CardRegistry& r) {
    r.registerCard(914, std::make_unique<Lacerate>());
}

} // namespace riftbound
