#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Jinx, Demolitionist (VEN-168/166)
///
///   [Accelerate][Assault 2]When you play me, discard 2.
class JinxDemolitionist : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    // [Accelerate] and [Assault 2] are declared keywords, handled centrally.
    // The printed effect is the discard, and it is NOT optional.
    TriggerType triggerType() const override { return TriggerType::WhenYouPlayMe; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        ctx.executor.discardCards(ctx.controller, 2);
        ctx.events.logTrace("JINX DEMOLITIONIST: played -> discard 2");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 955;
        d.def_id = R"RB(ven-168-166)RB";
        d.name = R"RB(Jinx, Demolitionist)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-168/166)RB";
        d.collector_number = 168;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 3;
        d.power_cost = 1;
        d.might = 4;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Accelerate);
        d.keywords.set(Keyword::Assault);
        d.assault_value = 2;
        d.ability_text = R"RB([Accelerate][Assault 2]When you play me, discard 2.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-168-166-1613f29cb59875f4.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_955(CardRegistry& r) {
    r.registerCard(955, std::make_unique<JinxDemolitionist>());
}

} // namespace riftbound
