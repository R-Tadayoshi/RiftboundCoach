#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Reluctant Leader (VEN-121/166)
///
///   When you play another unit, give me +2 :rb_might: this turn.
class ReluctantLeader : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    // "When you play ANOTHER unit" — the trigger fires on my own arrival too,
    // so the source has to exclude itself explicitly.
    TriggerType triggerType() const override { return TriggerType::WhenYouPlayAUnit; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        if (!targets.empty() && targets[0] == ctx.source) return;   // "another"
        ctx.executor.giveTemporaryMight(ctx.source, 2);
        ctx.events.logTrace("RELUCTANT LEADER: another unit played -> +2 [M] this turn");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 908;
        d.def_id = R"RB(ven-121-166)RB";
        d.name = R"RB(Reluctant Leader)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-121/166)RB";
        d.collector_number = 121;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Order};
        d.energy_cost = 4;
        d.power_cost = 1;
        d.might = 3;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(When you play another unit, give me +2 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-121-166-50d3d0ca67d89269.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_908(CardRegistry& r) {
    r.registerCard(908, std::make_unique<ReluctantLeader>());
}

} // namespace riftbound
