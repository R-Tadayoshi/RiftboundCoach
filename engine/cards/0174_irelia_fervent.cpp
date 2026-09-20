#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"
#include <algorithm>
#include <memory>
#include <string>
#include <vector>

namespace riftbound {
namespace {

class IreliaFervent : public UnitCard {
public:
    const CardDef& def() const override { return def_; }
    // "When you choose OR ready me, give me +1 [M] this turn." Both halves
    // now have an engine trigger; both grant the same +1 M.
    std::vector<TriggerType> triggerTypes() const override {
        return {TriggerType::WhenYouChooseAFriendlyUnit, TriggerType::WhenIAmReadied};
    }
    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        ctx.executor.giveTemporaryMight(ctx.source, 1);
        ctx.events.logTrace("IRELIA FERVENT: chosen/readied -> +1 [M] this turn");
    }
private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 961;
        d.def_id = R"RB(ven-174-166)RB";
        d.name = R"RB(Irelia, Fervent)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-174/166)RB";
        d.collector_number = 174;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 5;
        d.might = 4;
        d.rarity = Rarity::Epic;
        d.keywords.set(Keyword::Deflect);
        d.deflect_value = 1;
        d.ability_text = R"RB([Deflect]When you choose or ready me, give me +1 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-174-166-3092324c12d9e93b.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_961(CardRegistry& r) {
    r.registerCard(961, std::make_unique<IreliaFervent>());
}

} // namespace riftbound
