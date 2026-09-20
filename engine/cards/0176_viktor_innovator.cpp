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

class ViktorInnovator : public UnitCard {
public:
    const CardDef& def() const override { return def_; }
    // "When you play a card on an opponent's turn, play a 1 [M] Recruit unit
    // token in your base." No single "play a card" trigger exists, so register
    // for spell / unit / gear plays and gate on it being the opponent's turn.
    std::vector<TriggerType> triggerTypes() const override {
        return {TriggerType::WhenYouPlayASpell,
                TriggerType::WhenYouPlayAUnit,
                TriggerType::WhenYouPlayAGear};
    }
    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>& /*targets*/) override {
        // Only on an opponent's turn (the turn player is not the controller).
        if (ctx.state.turn.turn_player == ctx.controller) return;
        LocationId loc{BaseLocation{ctx.controller}};
        ctx.executor.createToken(ctx.controller, CardType::Unit, "Recruit",
                                 1, {"Recruit"}, KeywordSet{}, loc, false);
        ctx.events.logTrace("VIKTOR, INNOVATOR: off-turn play -> 1[M] Recruit in base");
    }
private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 963;
        d.def_id = R"RB(ven-176-166)RB";
        d.name = R"RB(Viktor, Innovator)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-176/166)RB";
        d.collector_number = 176;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Mind};
        d.energy_cost = 4;
        d.power_cost = 1;
        d.might = 3;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB(When you play a card on an opponent's turn, play a 1 :rb_might: Recruit unit token to your base.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-176-166-afa65d54ef5835e5.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_963(CardRegistry& r) {
    r.registerCard(963, std::make_unique<ViktorInnovator>());
}

} // namespace riftbound
