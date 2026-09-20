#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Diana, No Longer Human (VEN-183/166)
///
///   [Ambush]When you play a spell, give me +2 :rb_might: this turn.
class DianaNoLongerHuman : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    // [Ambush] is a declared keyword. The effect triggers on YOUR spells,
    // any of them, and buffs only me — no target to choose.
    TriggerType triggerType() const override { return TriggerType::WhenYouPlayASpell; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        ctx.executor.giveTemporaryMight(ctx.source, 2);
        ctx.events.logTrace("DIANA NO LONGER HUMAN: a spell was played -> +2 [M] this turn");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 970;
        d.def_id = R"RB(ven-183-166)RB";
        d.name = R"RB(Diana, No Longer Human)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-183/166)RB";
        d.collector_number = 183;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Chaos};
        d.energy_cost = 4;
        d.power_cost = 1;
        d.might = 3;
        d.rarity = Rarity::Epic;
        d.keywords.set(Keyword::Ambush);
        d.ability_text = R"RB([Ambush]When you play a spell, give me +2 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-183-166-088e3c5762010226.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_970(CardRegistry& r) {
    r.registerCard(970, std::make_unique<DianaNoLongerHuman>());
}

} // namespace riftbound
