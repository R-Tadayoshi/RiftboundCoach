#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Clairvoyance (VEN-056/166)
///
///   [Reaction] (Play any time, even before spells and abilities resolve.)[Predict 5]. (Look at the top 5 cards of your Main Deck. Recycle any of them and put the rest back in any order.)Draw 2.
class Clairvoyance : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    // [Reaction] is a declared keyword. [Predict 5] then draw 2 — in that
    // order, since the point of predicting first is to choose what you then
    // draw.
    void onResolve(CardContext& ctx, const std::vector<GameObjectId>&) override {
        ctx.executor.predict(ctx.controller, 5);
        ctx.executor.drawCards(ctx.controller, 2);
        ctx.events.logTrace("CLAIRVOYANCE: predict 5, then draw 2");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 843;
        d.def_id = R"RB(ven-056-166)RB";
        d.name = R"RB(Clairvoyance)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-056/166)RB";
        d.collector_number = 56;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Mind};
        d.energy_cost = 7;
        d.rarity = Rarity::Uncommon;
        d.keywords.set(Keyword::Reaction);
        d.keywords.set(Keyword::Predict);
        d.ability_text = R"RB([Reaction] (Play any time, even before spells and abilities resolve.)[Predict 5]. (Look at the top 5 cards of your Main Deck. Recycle any of them and put the rest back in any order.)Draw 2.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-056-166-e65bfd5fefbe8e66.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_843(CardRegistry& r) {
    r.registerCard(843, std::make_unique<Clairvoyance>());
}

} // namespace riftbound
