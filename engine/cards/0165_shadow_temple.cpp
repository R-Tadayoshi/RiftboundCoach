#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Shadow Temple (VEN-165/166)
///
///   When you hold here, [Burn 3]. (Put the top 3 cards of your Main Deck into your trash.)
class ShadowTemple : public BattlefieldCard {
public:
    const CardDef& def() const override { return def_; }

    // "When you hold here, [Burn 3]." The burn is the holder\x27s own deck.
    TriggerType triggerType() const override { return TriggerType::WhenYouHoldHere; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        ctx.executor.burnCards(ctx.controller, 3);
        ctx.events.logTrace("SHADOW TEMPLE: held here -> burn 3");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 952;
        d.def_id = R"RB(ven-165-166)RB";
        d.name = R"RB(Shadow Temple)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-165/166)RB";
        d.collector_number = 165;
        d.card_type = CardType::Battlefield;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(When you hold here, [Burn 3]. (Put the top 3 cards of your Main Deck into your trash.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-165-166-dc3f6e4ed7fa1a7e.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_952(CardRegistry& r) {
    r.registerCard(952, std::make_unique<ShadowTemple>());
}

} // namespace riftbound
