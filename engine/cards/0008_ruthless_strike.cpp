#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Ruthless Strike (VEN-008/166)
///
///   [Action] As an additional cost to play this, you may discard 1.
///   Deal 3 to a unit at a battlefield. If you paid the additional cost,
///   deal 5 to it instead.
///
/// The discard buys an EFFECT, not a discount, and that shape was handled
/// nowhere: the engine's prepay path only fires for discard-to-reduce-cost
/// (Brazen Buccaneer), and maybePayOptionalAdditionalCost bailed on any
/// discard at all. The option was never offered, so the card would always
/// have resolved as its cheaper half — 3 damage, forever, with no error.
///
/// Whether it was paid is read from card_counters at resolution, which is
/// where the engine records it. 5 INSTEAD of 3, not in addition.
class RuthlessStrike : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    bool isActionAbility() const override { return true; }
    bool needsPlayTimeTarget() const override { return true; }

    OptionalAdditionalCost optionalAdditionalCost() const override {
        OptionalAdditionalCost c;
        c.valid = true;
        c.discard_cards = 1;
        c.paid_flag = "ruthless_strike_paid";
        return c;
    }

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
        else picked = pickTarget(ctx, "Ruthless Strike: a unit at a battlefield",
                                 enumerateLegalTargets(ctx.state, ctx.controller));
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        bool paid = false;
        if (ctx.state.objectExists(ctx.source)) {
            auto& self = ctx.state.getObject(ctx.source);
            auto it = self.card_counters.find("ruthless_strike_paid");
            paid = it != self.card_counters.end() && it->second != 0;
        }

        const int amount = paid ? 5 : 3;
        ctx.executor.dealDamage(picked, amount, ctx.source);
        ctx.events.logTrace("RUTHLESS STRIKE: dealt " + std::to_string(amount) +
                             (paid ? " (discard paid)" : ""));
        if (ctx.state.objectExists(picked) &&
            ctx.state.getObject(picked).hasLethalDamage()) {
            ctx.executor.killObject(picked);
        }
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 795;
        d.def_id = R"RB(ven-008-166)RB";
        d.name = R"RB(Ruthless Strike)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-008/166)RB";
        d.collector_number = 8;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Fury};
        d.energy_cost = 3;
        d.rarity = Rarity::Common;
        d.keywords.set(Keyword::Action);
        d.ability_text = R"RB([Action] (Play on your turn or in showdowns.)As an additional cost to play this, you may discard 1.Deal 3 to a unit at a battlefield. If you paid the additional cost, deal 5 to it instead.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-008-166-4c163c1144bcfa2e.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_795(CardRegistry& r) {
    r.registerCard(795, std::make_unique<RuthlessStrike>());
}

} // namespace riftbound
