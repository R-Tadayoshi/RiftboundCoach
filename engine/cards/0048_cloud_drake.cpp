#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Cloud Drake (VEN-048/166)
///
///   When you play me, draw 1.
class CloudDrake : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenYouPlayMe; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        ctx.executor.drawCards(ctx.controller, 1);
        ctx.events.logTrace("CLOUD DRAKE: played -> draw 1");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 835;
        d.def_id = R"RB(ven-048-166)RB";
        d.name = R"RB(Cloud Drake)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-048/166)RB";
        d.collector_number = 48;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Mind};
        d.energy_cost = 6;
        d.might = 5;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(When you play me, draw 1.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-048-166-13639723ece0a8f3.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_835(CardRegistry& r) {
    r.registerCard(835, std::make_unique<CloudDrake>());
}

} // namespace riftbound
