#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Public Execution (VEN-154/166)
///
///   Choose a friendly unit. Kill an enemy unit with less Might than it.
///   [Flow] [5][A][A]
///
/// Two picks, and the second depends on the first — the set of killable
/// enemies is whatever has strictly less Might than the friendly unit
/// chosen. pickTargetPair exists for exactly this and reserves its own
/// resume points, so the card must not also call pickTarget.
///
/// "less Might than it" is strict. A trade of equals is not this card, and
/// offering one would be offering a play that fizzles.
class PublicExecution : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    FlowCost flowCost() const override {
        return {.valid = true, .energy = 5, .power = 2, .any_domain = true};
    }

    bool needsPlayTimeTargetPair() const override { return true; }

    TargetRequirements getTargetRequirements() const override {
        return {.count = 2, .must_be_unit = true};
    }

    /// The pair picker asks for the FIRST target's candidates here: friendly
    /// units big enough to be able to kill something. A friendly unit with
    /// nothing smaller opposite it is not a legal choice — picking it would
    /// leave the second pick empty and the spell would do nothing.
    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
            if (killable(state, controller, obj.current_might).empty()) continue;
            out.push_back(id);
        }
        return out;
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller).empty();
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        GameObjectId friendly = kInvalidId, victim = kInvalidId;
        if (targets.size() >= 2) {
            friendly = targets[0];
            victim = targets[1];
        } else {
            const PlayerId me = ctx.controller;
            GameState& st = ctx.state;
            auto pair = pickTargetPair(
                ctx, "Public Execution: friendly unit, then a smaller enemy",
                enumerateLegalTargets(st, me),
                [&st, me](GameObjectId first) {
                    if (!st.objectExists(first)) return std::vector<GameObjectId>{};
                    return killable(st, me, st.getObject(first).current_might);
                });
            friendly = pair.first;
            victim = pair.second;
        }
        if (friendly == kInvalidId || victim == kInvalidId) return;
        if (!ctx.state.objectExists(friendly) || !ctx.state.objectExists(victim)) return;

        // Re-checked at resolution: the friendly unit may have shrunk, or the
        // victim grown, between choosing and resolving.
        if (ctx.state.getObject(victim).current_might >=
            ctx.state.getObject(friendly).current_might) {
            ctx.events.logTrace("PUBLIC EXECUTION: target is no longer smaller — fizzles");
            return;
        }
        ctx.events.logTrace("PUBLIC EXECUTION: killed " +
                             ctx.state.getObject(victim).name);
        ctx.executor.killObject(victim);
    }

private:
    static std::vector<GameObjectId> killable(const GameState& state,
                                              PlayerId controller, int less_than) {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || obj.controller == controller) continue;
            if (!obj.location.has_value()) continue;
            if (obj.untargetable_by_enemy) continue;
            if (obj.current_might >= less_than) continue;   // strictly less
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 941;
        d.def_id = R"RB(ven-154-166)RB";
        d.name = R"RB(Public Execution)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-154/166)RB";
        d.collector_number = 154;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Body, Domain::Order};
        d.energy_cost = 2;
        d.power_cost = 1;
        d.rarity = Rarity::Epic;
        d.ability_text = R"RB(Choose a friendly unit. Kill an enemy unit with less Might than it.[Flow] :rb_energy_5::rb_rune_rainbow::rb_rune_rainbow: (You may play this from your trash for its Flow cost. Then banish it.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-154-166-2a11717f8bb2620a.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_941(CardRegistry& r) {
    r.registerCard(941, std::make_unique<PublicExecution>());
}

} // namespace riftbound
