#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"
#include <string>
#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Acceleration Gate (VEN-150/166)
///
///   Ready up to 4 units, gear, and/or runes.
class AccelerationGate : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    // "Ready up to 4 units, gear, and/or runes." Up to four, so an empty
    // choice is legal and readying an already-ready permanent is pointless —
    // only exhausted ones are offered.
    bool needsPlayTimeTarget() const override { return true; }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId player) const override {
        std::vector<GameObjectId> legal;
        for (auto& [id, obj] : state.objects) {
            if (obj.controller != player) continue;
            if (!obj.is_exhausted) continue;
            const bool readyable = obj.isUnit() ||
                                   obj.card_type == CardType::Gear ||
                                   obj.card_type == CardType::Rune;
            if (!readyable) continue;
            legal.push_back(id);
        }
        return legal;
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        int readied = 0;
        for (auto id : targets) {
            if (readied >= 4) break;
            if (!ctx.state.objectExists(id)) continue;
            ctx.executor.readyObject(id);
            ++readied;
        }
        ctx.events.logTrace("ACCELERATION GATE: readied " + std::to_string(readied));
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 937;
        d.def_id = R"RB(ven-150-166)RB";
        d.name = R"RB(Acceleration Gate)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-150/166)RB";
        d.collector_number = 150;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Body, Domain::Mind};
        d.energy_cost = 3;
        d.power_cost = 1;
        d.rarity = Rarity::Epic;
        d.ability_text = R"RB(Ready up to 4 units, gear, and/or runes.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-150-166-5b6f71297ffd340b.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_937(CardRegistry& r) {
    r.registerCard(937, std::make_unique<AccelerationGate>());
}

} // namespace riftbound
