#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Leona, Determined (VEN-184/166)
///
///   [Shield]When I attack, stun an enemy unit here.
class LeonaDetermined : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    // [Shield] is a declared keyword. "Stun an enemy unit HERE" — only units
    // at the same battlefield are candidates, which is what makes this a
    // narrower effect than it reads.
    TriggerType triggerType() const override { return TriggerType::WhenIAttack; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        const auto& me = ctx.state.getObject(ctx.source);
        if (!me.location.has_value()) return;

        std::vector<GameObjectId> legal;
        for (auto& [id, obj] : ctx.state.objects) {
            if (obj.controller == ctx.controller) continue;
            if (!obj.isUnit() || !obj.location.has_value()) continue;
            if (!(*obj.location == *me.location)) continue;   // "here"
            if (obj.untargetable_by_enemy) continue;
            legal.push_back(id);
        }
        if (legal.empty()) return;
        const GameObjectId t = pickTarget(ctx, "Leona, Determined: stun an enemy unit here", legal);
        if (t == kInvalidId || !ctx.state.objectExists(t)) return;
        ctx.executor.stunUnitBy(t, ctx.source);
        ctx.events.logTrace("LEONA DETERMINED: attacked -> stunned an enemy unit here");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 971;
        d.def_id = R"RB(ven-184-166)RB";
        d.name = R"RB(Leona, Determined)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-184/166)RB";
        d.collector_number = 184;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Order};
        d.energy_cost = 4;
        d.power_cost = 1;
        d.might = 4;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Shield);
        d.shield_value = 1;
        d.ability_text = R"RB([Shield]When I attack, stun an enemy unit here.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-184-166-6eb668868ab6b2a5.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_971(CardRegistry& r) {
    r.registerCard(971, std::make_unique<LeonaDetermined>());
}

} // namespace riftbound
