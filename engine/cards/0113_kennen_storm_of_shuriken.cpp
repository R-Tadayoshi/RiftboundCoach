#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Kennen, Storm of Shuriken (VEN-113/166)
///
///   When you play me, [Burn 2]. (Put the top 2 cards of your Main Deck into your trash.)When I conquer, give a spell in your trash [Flow] equal to its cost this turn. (You may play it from your trash for its Flow cost. Then banish it.)
class KennenStormOfShuriken : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    // "When you play me, [Burn 2]." The conquer clause needs a spell-cost
    // modifier scoped to a battlefield and is NOT implemented here.
    // PARTIAL: only the burn-on-play clause is written.
    TriggerType triggerType() const override { return TriggerType::WhenYouPlayMe; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        ctx.executor.burnCards(ctx.controller, 2);
        ctx.events.logTrace("KENNEN: played -> burn 2");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 900;
        d.def_id = R"RB(ven-113-166)RB";
        d.name = R"RB(Kennen, Storm of Shuriken)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-113/166)RB";
        d.collector_number = 113;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Chaos};
        d.energy_cost = 3;
        d.power_cost = 1;
        d.might = 4;
        d.rarity = Rarity::Epic;
        d.ability_text = R"RB(When you play me, [Burn 2]. (Put the top 2 cards of your Main Deck into your trash.)When I conquer, give a spell in your trash [Flow] equal to its cost this turn. (You may play it from your trash for its Flow cost. Then banish it.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-113-166-6f0b20a963933fa4.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_900(CardRegistry& r) {
    r.registerCard(900, std::make_unique<KennenStormOfShuriken>());
}

} // namespace riftbound
