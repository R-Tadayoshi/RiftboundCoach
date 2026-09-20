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

class KhaZixEvolvingHunter : public UnitCard {
public:
    const CardDef& def() const override { return def_; }
    std::vector<TriggerType> triggerTypes() const override {
        return {TriggerType::WhenIConquerOrHold, TriggerType::WhenIAttack};
    }
    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>& /*targets*/) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        if (ctx.firing_trigger == TriggerType::WhenIConquerOrHold) {
            ctx.state.player(ctx.controller).xp += 1;  // [Hunt]
            ctx.events.logTrace("KHA'ZIX: [Hunt] +1 XP");
            return;
        }
        // WhenIAttack — optional: spend 3 XP, deal my Might to an enemy unit here.
        auto& self = ctx.state.getObject(ctx.source);
        auto my_bf = self.battlefieldId();
        if (!my_bf) return;
        auto enemiesHere = [&]() {
            std::vector<GameObjectId> out;
            for (auto& [id, obj] : ctx.state.objects) {
                if (!obj.isUnit() || obj.controller == ctx.controller) continue;
                if (obj.battlefieldId() == my_bf) out.push_back(id);
            }
            return out;
        };
        if (ctx.state.player(ctx.controller).xp < 3 || enemiesHere().empty()) return;
        int yes = confirmOptional(ctx, "Kha'Zix: spend 3 XP to deal my Might?",
                                  [&]() { return ctx.state.player(ctx.controller).xp >= 3 &&
                                                 !enemiesHere().empty(); });
        if (yes != 1) return;
        GameObjectId tgt = pickTarget(ctx, "Kha'Zix: deal Might to enemy here",
                                      enemiesHere());
        if (tgt == kInvalidId || !ctx.state.objectExists(tgt)) return;
        ctx.state.player(ctx.controller).xp -= 3;
        int might = ctx.state.getObject(ctx.source).current_might;
        ctx.executor.dealDamage(tgt, might, ctx.source);
        if (ctx.state.objectExists(tgt) && ctx.state.getObject(tgt).hasLethalDamage()) {
            ctx.executor.killObject(tgt);
        }
        ctx.events.logTrace("KHA'ZIX: spent 3 XP, dealt " + std::to_string(might));
    }
private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 967;
        d.def_id = R"RB(ven-180-166)RB";
        d.name = R"RB(Kha'Zix, Evolving Hunter)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-180/166)RB";
        d.collector_number = 180;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Body};
        d.energy_cost = 5;
        d.power_cost = 1;
        d.might = 5;
        d.rarity = Rarity::Epic;
        d.keywords.set(Keyword::Hunt);
        d.ability_text = R"RB([Hunt]When I attack, you may spend 3 XP to deal damage equal to my Might to an enemy unit here.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-180-166-6523cf8dae9ffa6d.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_967(CardRegistry& r) {
    r.registerCard(967, std::make_unique<KhaZixEvolvingHunter>());
}

} // namespace riftbound
