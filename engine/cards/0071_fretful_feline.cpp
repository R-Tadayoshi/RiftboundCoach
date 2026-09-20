#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Fretful Feline (VEN-071/166)
///
///   When I become ready, give me +2 :rb_might: this turn.
class FretfulFeline : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    // "When I become ready, give me +2 [M] this turn." No target — always me.
    TriggerType triggerType() const override { return TriggerType::WhenIAmReadied; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        ctx.executor.giveTemporaryMight(ctx.source, 2);
        ctx.events.logTrace("FRETFUL FELINE: readied -> +2 [M] this turn");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 858;
        d.def_id = R"RB(ven-071-166)RB";
        d.name = R"RB(Fretful Feline)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-071/166)RB";
        d.collector_number = 71;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Body};
        d.energy_cost = 6;
        d.might = 5;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(When I become ready, give me +2 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-071-166-71bd7c4ba7f14cdc.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_858(CardRegistry& r) {
    r.registerCard(858, std::make_unique<FretfulFeline>());
}

} // namespace riftbound
