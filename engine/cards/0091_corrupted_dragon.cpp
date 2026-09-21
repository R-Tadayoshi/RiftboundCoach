#include "cards/card_helpers.h"

#include <algorithm>
#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Corrupted Dragon (VEN-091/166)
///
///   If your score is not within 3 points of the Victory Score, I enter
///   ready.
///   When I attack, you may move any number of enemy units here each with
///   5 [M] or less to their base.
///
/// A CATCH-UP CARD, and the condition is on the LOSING side. "Not within 3
/// points of the Victory Score" means `victory_score - score > 3`: at the
/// default 8, a score of 5 or more is within 3 and the Dragon enters
/// exhausted. Reading it the other way round would hand the ready body to
/// whoever is already winning, which is the opposite card.
///
/// Read from `ModeOfPlay::victory_score` rather than a hard 8, because the
/// mode carries it and a format that changes it should change this.
///
/// "ANY NUMBER ... EACH WITH 5 [M] OR LESS" — per-unit, not a running total.
/// Compare Decree of Discord, whose cap is cumulative: there the budget
/// shrinks with every pick, here every unit is judged on its own. Same
/// picker, different `legal_fn`, and getting the two confused is how a card
/// ends up clearing a battlefield it should have dented.
///
/// The cap on how many is the number of enemy units that qualify, which is
/// bounded by the board rather than by the text — so it is counted once at
/// the first prompt and used as the picker's size. The count cannot grow
/// during the picker's own run: nothing resolves between its prompts.
class CorruptedDragon : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    bool entersReadyOnPlay(const GameState& state,
                           PlayerId controller) const override {
        return state.mode.victory_score - state.player(controller).score > 3;
    }

    TriggerType triggerType() const override { return TriggerType::WhenIAttack; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;

        GameState& st = ctx.state;
        const PlayerId me = ctx.controller;
        const GameObjectId self = ctx.source;
        const int cap = static_cast<int>(smallEnemiesHere(st, me, self, {}).size());
        if (cap == 0) {
            ctx.events.logTrace("CORRUPTED DRAGON: no enemy unit here with 5 [M] or less");
            return;
        }

        auto picks = pickTargets(
            ctx, "Corrupted Dragon: send enemy units here with 5 [M] or less to base",
            [&st, me, self](const std::vector<GameObjectId>& so_far) {
                return smallEnemiesHere(st, me, self, so_far);
            },
            /*max_count=*/cap, /*optional=*/true);
        if (!picks.has_value()) return;   // suspended — MUST return

        for (auto id : *picks) {
            if (!ctx.state.objectExists(id)) continue;
            ctx.events.logTrace("CORRUPTED DRAGON: sent " +
                                 ctx.state.getObject(id).name + " to base");
            ctx.executor.moveToBase(id);
        }
    }

private:
    /// Enemy units at the Dragon's battlefield with 5 Might or less, minus
    /// anything already picked. The cap is PER UNIT, so nothing shrinks as
    /// picks accumulate.
    static std::vector<GameObjectId> smallEnemiesHere(const GameState& state,
                                                       PlayerId controller,
                                                       GameObjectId self,
                                                       const std::vector<GameObjectId>& so_far) {
        std::vector<GameObjectId> out;
        if (!state.objectExists(self)) return out;
        const auto here = state.getObject(self).battlefieldId();
        if (!here) return out;

        for (const auto& [id, obj] : state.objects) {
            if (!obj.isUnit()) continue;
            if (obj.controller == controller) continue;
            const auto bf = obj.battlefieldId();
            if (!bf || *bf != *here) continue;
            if (obj.current_might > 5) continue;
            if (obj.untargetable_by_enemy || obj.untargetable_by_enemy_this_turn) continue;
            if (std::find(so_far.begin(), so_far.end(), id) != so_far.end()) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 878;
        d.def_id = R"RB(ven-091-166)RB";
        d.name = R"RB(Corrupted Dragon)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-091/166)RB";
        d.collector_number = 91;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Body};
        d.energy_cost = 10;
        d.power_cost = 2;
        d.might = 10;
        d.rarity = Rarity::Epic;
        d.ability_text = R"RB(If your score is not within 3 points of the Victory Score, I enter ready.When I attack, you may move any number of enemy units here each with 5 :rb_might: or less to their base.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-091-166-de58d3d0fbf10651.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_878(CardRegistry& r) {
    r.registerCard(878, std::make_unique<CorruptedDragon>());
}

} // namespace riftbound
