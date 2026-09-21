#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Consuming Curse (VEN-010/166)
///
///   [Action] Deal 2 to a unit at a battlefield. This deals 1 Bonus Damage
///   for each card with this name in your trash.
///
/// The second and third copies hit for 3 and 4, so the deck wants to draw
/// them in order and a search that read a flat 2 would never hold one back.
///
/// "With this NAME", not "this card": a reprint under a different collector
/// number is still a Consuming Curse and still counts, which is why the
/// count is by printed name rather than by card_def_id. Card naming has bitten
/// this project repeatedly in the other direction too.
///
/// "In YOUR trash" — the controller's, not both. Counted at resolution,
/// since the spell itself does not reach the trash until after it resolves
/// and therefore never counts itself.
class ConsumingCurse : public SpellCard {
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
        else picked = pickTarget(ctx, "Consuming Curse: a unit at a battlefield",
                                 enumerateLegalTargets(ctx.state, ctx.controller));
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        int bonus = 0;
        for (auto id : ctx.state.player(ctx.controller).trash) {
            if (!ctx.state.objectExists(id)) continue;
            if (ctx.state.getObject(id).name == def_.name) ++bonus;
        }

        const int total = 2 + bonus;
        ctx.executor.dealDamage(picked, total, ctx.source);
        ctx.events.logTrace("CONSUMING CURSE: dealt " + std::to_string(total) +
                             " (2 + " + std::to_string(bonus) + " in trash)");
        if (ctx.state.objectExists(picked) &&
            ctx.state.getObject(picked).hasLethalDamage()) {
            ctx.executor.killObject(picked);
        }
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 797;
        d.def_id = R"RB(ven-010-166)RB";
        d.name = R"RB(Consuming Curse)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-010/166)RB";
        d.collector_number = 10;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Fury};
        d.energy_cost = 2;
        d.rarity = Rarity::Uncommon;
        d.keywords.set(Keyword::Action);
        d.ability_text = R"RB([Action] (Play on your turn or in showdowns.)Deal 2 to a unit at a battlefield. This deals 1 Bonus Damage for each card with this name in your trash.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-010-166-702bb9554e23e1eb.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_797(CardRegistry& r) {
    r.registerCard(797, std::make_unique<ConsumingCurse>());
}

} // namespace riftbound
