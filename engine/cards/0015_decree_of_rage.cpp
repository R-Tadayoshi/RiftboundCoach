#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Decree of Rage (VEN-015/166)
///
///   [Action] This can't be countered.
///   Deal 4 to an enemy Calm (:rb_rune_calm:) unit.
///
/// The "can't be countered" half is the reason Card::canBeCountered exists.
/// Before it, every counterspell popped the chain's top item without asking
/// the card anything, so this line was unrepresentable and the card sat as a
/// generated stub. Countering now goes through chainItemCanBeCountered()
/// (cards/card_helpers.h), which asks the card first.
class DecreeOfRage : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    bool canBeCountered() const override { return false; }

    // "an enemy Calm unit" — enemy, on the board, a unit, Calm, and not
    // hidden behind an untargetable-by-enemy effect. Each clause is a way
    // the spell can have no legal target at all, which matters: a spell with
    // no legal target is not playable, rather than playable and wasted.
    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId player) const override {
        std::vector<GameObjectId> legal;
        for (auto& [id, obj] : state.objects) {
            if (obj.controller == player) continue;
            if (!obj.location.has_value()) continue;
            if (!obj.isUnit()) continue;
            if (obj.untargetable_by_enemy) continue;
            bool calm = false;
            for (auto d : obj.domains) if (d == Domain::Calm) calm = true;
            if (!calm) continue;
            legal.push_back(id);
        }
        return legal;
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller).empty();
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        if (targets.empty() || !ctx.state.objectExists(targets[0])) return;
        ctx.executor.dealDamage(targets[0], 4, ctx.source);
        ctx.events.logTrace("DECREE OF RAGE: dealt 4 to an enemy Calm unit");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 802;
        d.def_id = R"RB(ven-015-166)RB";
        d.name = R"RB(Decree of Rage)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-015/166)RB";
        d.collector_number = 15;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Fury};
        d.energy_cost = 1;
        d.power_cost = 1;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Action);
        d.ability_text = R"RB([Action] (Play on your turn or in showdowns.)This can't be countered.Deal 4 to an enemy Calm (:rb_rune_calm:) unit.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-015-166-6840be7922560dd6.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_802(CardRegistry& r) {
    r.registerCard(802, std::make_unique<DecreeOfRage>());
}

} // namespace riftbound
