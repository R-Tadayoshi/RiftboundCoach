#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"
#include <algorithm>
#include <memory>
#include <string>
#include <vector>
#include "cards/card_helpers.h"

namespace riftbound {
namespace {

class ViDestructive : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    // "Recycle 1 from your trash: Give me +1 [M] this turn." The recycle is
    // the activation cost (no [E]); paid inside onActivate. Targets self only.
    bool hasActivatedAbility() const override { return true; }
    ActivationCost getActivationCost() const override { return {}; }
    bool canActivateAbility(const GameState& state,
                            PlayerId controller) const override {
        const auto& ps = state.player(controller);
        for (auto cid : ps.trash)
            if (state.objectExists(cid)) return true;
        return false;
    }
    void onActivate(CardContext& ctx,
                    const std::vector<GameObjectId>& /*targets*/) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        auto& ps = ctx.state.player(ctx.controller);
        // Pay cost: recycle 1 card from trash (oldest first).
        GameObjectId to_recycle = kInvalidId;
        for (auto cid : ps.trash)
            if (ctx.state.objectExists(cid)) { to_recycle = cid; break; }
        if (to_recycle == kInvalidId) return;
        auto it = std::find(ps.trash.begin(), ps.trash.end(), to_recycle);
        if (it != ps.trash.end()) ps.trash.erase(it);
        ctx.executor.recycleCards(ctx.controller, {to_recycle});
        ctx.executor.giveTemporaryMight(ctx.source, 1);
        ctx.events.logTrace("VI: recycled 1 from trash -> +1 [M] this turn");
    }
private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 954;
        d.def_id = R"RB(ven-167-166)RB";
        d.name = R"RB(Vi, Destructive)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-167/166)RB";
        d.collector_number = 167;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 2;
        d.power_cost = 1;
        d.might = 3;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Ganking);
        d.ability_text = R"RB([Ganking]Recycle 1 from your trash: Give me +1 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-167-166-361df019f5871ec0.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_954(CardRegistry& r) {
    r.registerCard(954, std::make_unique<ViDestructive>());
}

} // namespace riftbound
