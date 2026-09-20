#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Decree of Unity (VEN-131/166)
///
///   Kill an enemy Chaos (:rb_rune_chaos:) unit or gear.
class DecreeOfUnity : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    // "Kill an enemy Chaos unit or gear." Two conditions that are easy to
    // drop: it must be an ENEMY permanent, and it must have the Chaos domain.
    // Gear counts as well as units.
    bool needsPlayTimeTarget() const override { return true; }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId player) const override {
        std::vector<GameObjectId> legal;
        for (auto& [id, obj] : state.objects) {
            if (obj.controller == player) continue;
            if (!obj.location.has_value()) continue;
            const bool unit_or_gear = obj.isUnit() || obj.card_type == CardType::Gear;
            if (!unit_or_gear) continue;
            if (obj.untargetable_by_enemy) continue;
            bool chaos = false;
            for (auto d : obj.domains) if (d == Domain::Chaos) chaos = true;
            if (!chaos) continue;
            legal.push_back(id);
        }
        return legal;
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        if (targets.empty() || !ctx.state.objectExists(targets[0])) return;
        ctx.executor.killObject(targets[0]);
        ctx.events.logTrace("DECREE OF UNITY: killed an enemy Chaos permanent");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 918;
        d.def_id = R"RB(ven-131-166)RB";
        d.name = R"RB(Decree of Unity)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-131/166)RB";
        d.collector_number = 131;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Order};
        d.energy_cost = 2;
        d.power_cost = 1;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB(Kill an enemy Chaos (:rb_rune_chaos:) unit or gear.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-131-166-0b12d9ad6d99312c.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_918(CardRegistry& r) {
    r.registerCard(918, std::make_unique<DecreeOfUnity>());
}

} // namespace riftbound
