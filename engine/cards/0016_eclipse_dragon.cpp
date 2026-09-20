#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Eclipse Dragon (VEN-016/166)
///
///   [Accelerate] (You may pay :rb_energy_1::rb_rune_fury: as an additional cost to have me enter ready.)When I move, if you control 4 or fewer runes, draw 1.
class EclipseDragon : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    // [Accelerate] is a declared keyword. "When I move, if you control 4 or
    // fewer runes, draw 1." — the condition is checked at resolution, not at
    // the time the move was declared.
    TriggerType triggerType() const override { return TriggerType::WhenIMove; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        int runes = 0;
        for (auto& [id, obj] : ctx.state.objects) {
            if (obj.controller != ctx.controller) continue;
            if (obj.card_type != CardType::Rune) continue;
            if (!obj.location.has_value()) continue;   // on the board
            ++runes;
        }
        if (runes > 4) return;
        ctx.executor.drawCards(ctx.controller, 1);
        ctx.events.logTrace("ECLIPSE DRAGON: moved with <=4 runes -> draw 1");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 803;
        d.def_id = R"RB(ven-016-166)RB";
        d.name = R"RB(Eclipse Dragon)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-016/166)RB";
        d.collector_number = 16;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 8;
        d.might = 8;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Accelerate);
        d.ability_text = R"RB([Accelerate] (You may pay :rb_energy_1::rb_rune_fury: as an additional cost to have me enter ready.)When I move, if you control 4 or fewer runes, draw 1.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-016-166-05749cb15b94b74f.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_803(CardRegistry& r) {
    r.registerCard(803, std::make_unique<EclipseDragon>());
}

} // namespace riftbound
