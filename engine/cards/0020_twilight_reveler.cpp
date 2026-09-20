#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Twilight Reveler (VEN-020/166)
///
///   When I attack, ready another friendly unit.
class TwilightReveler : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenIAttack; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        // "ready ANOTHER friendly unit" — myself excluded, and only one that
        // is actually exhausted, since readying a ready unit does nothing.
        std::vector<GameObjectId> legal;
        for (auto& [id, obj] : ctx.state.objects) {
            if (id == ctx.source) continue;
            if (obj.controller != ctx.controller) continue;
            if (!obj.isUnit() || !obj.location.has_value()) continue;
            if (!obj.is_exhausted) continue;
            legal.push_back(id);
        }
        if (legal.empty()) return;
        const GameObjectId t = pickTarget(ctx, "Twilight Reveler: ready another friendly unit", legal);
        if (t == kInvalidId || !ctx.state.objectExists(t)) return;
        ctx.executor.readyObject(t);
        ctx.events.logTrace("TWILIGHT REVELER: attacked -> readied a friendly unit");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 807;
        d.def_id = R"RB(ven-020-166)RB";
        d.name = R"RB(Twilight Reveler)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-020/166)RB";
        d.collector_number = 20;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 3;
        d.might = 3;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB(When I attack, ready another friendly unit.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-020-166-4cc763e1d38bdbd3.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_807(CardRegistry& r) {
    r.registerCard(807, std::make_unique<TwilightReveler>());
}

} // namespace riftbound
