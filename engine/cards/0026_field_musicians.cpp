#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Field Musicians (VEN-026/166)
///
///   When you play me, give a unit +3 :rb_might: this turn.
class FieldMusicians : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenYouPlayMe; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        // "give a unit +3 [M] this turn" — any unit, not only a friendly one.
        std::vector<GameObjectId> legal;
        for (auto& [id, obj] : ctx.state.objects) {
            if (!obj.isUnit() || !obj.location.has_value()) continue;
            if (obj.controller != ctx.controller && obj.untargetable_by_enemy) continue;
            legal.push_back(id);
        }
        if (legal.empty()) return;
        const GameObjectId t = pickTarget(ctx, "Field Musicians: give a unit +3 [M]", legal);
        if (t == kInvalidId || !ctx.state.objectExists(t)) return;
        ctx.executor.giveTemporaryMight(t, 3);
        ctx.events.logTrace("FIELD MUSICIANS: +3 [M] this turn");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 813;
        d.def_id = R"RB(ven-026-166)RB";
        d.name = R"RB(Field Musicians)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-026/166)RB";
        d.collector_number = 26;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 4;
        d.might = 3;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(When you play me, give a unit +3 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-026-166-ddb1461fc7e5f94e.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_813(CardRegistry& r) {
    r.registerCard(813, std::make_unique<FieldMusicians>());
}

} // namespace riftbound
