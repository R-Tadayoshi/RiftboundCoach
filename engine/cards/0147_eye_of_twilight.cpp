#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Eye of Twilight (VEN-147)
///
///   [Action][>] [Exhaust]: Give a friendly unit [Tank] this turn.
///
/// [Action] means it can be activated during showdowns on any player's turn,
/// which is most of the card's value — handing a unit the obligation to be
/// assigned combat damage first, in response to how a combat is shaping up.
class EyeOfTwilight : public LegendCard {
public:
    const CardDef& def() const override { return def_; }

    bool hasActivatedAbility() const override { return true; }
    bool isActionAbility() const override { return true; }
    ActivationCost getActivationCost() const override { return {.exhaust = true}; }
    TriggerType triggerType() const override { return TriggerType::Activated; }

    TargetRequirements getTargetRequirements() const override {
        return TargetRequirements{.count = 1, .must_be_unit = true, .must_be_friendly = true};
    }

    void onActivate(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        if (targets.empty() || !ctx.state.objectExists(targets[0])) return;
        ctx.executor.giveTemporaryKeyword(targets[0], Keyword::Tank, 1);
        ctx.events.logTrace("EYE OF TWILIGHT: gave a friendly unit [Tank] this turn");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 934;
        d.def_id = R"RB(ven-147-166)RB";
        d.name = R"RB(Eye of Twilight)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-147/166)RB";
        d.collector_number = 147;
        d.card_type = CardType::Legend;
        d.domains = {Domain::Calm, Domain::Order};
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Action);
        d.keywords.set(Keyword::Tank);
        d.ability_text = R"RB([Action][>] :rb_exhaust:: Give a friendly unit [Tank] this turn. (It must be assigned combat damage first.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-147-166-83dd1d46dfa9f456.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_934(CardRegistry& r) {
    r.registerCard(934, std::make_unique<EyeOfTwilight>());
}

} // namespace riftbound
