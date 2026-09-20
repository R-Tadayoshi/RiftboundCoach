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

class KarmaChanneler : public UnitCard {
public:
    const CardDef& def() const override { return def_; }
    // Clause 1: "[Vision]" — engine-handled (TriggerManager peeks the top card on
    //   play for any unit with the Vision keyword; set in def below). Works.
    // Clause 2: "When you recycle one or more cards to your Main Deck, buff a
    //   friendly unit." Wired via WhenYouRecycle (EffectExecutor::recycleCards
    //   emits "recycled_main" per owner; TriggerManager fires this on the
    //   recycling player's on-board cards). Buff an agent-chosen friendly unit.
    TriggerType triggerType() const override { return TriggerType::WhenYouRecycle; }
    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        std::vector<GameObjectId> friendly;
        for (auto& [id, obj] : ctx.state.objects) {
            if (obj.isUnit() && obj.controller == ctx.controller &&
                obj.location.has_value())
                friendly.push_back(id);
        }
        if (friendly.empty()) return;
        GameObjectId pick = pickTarget(ctx, "Karma, Channeler: buff a friendly unit",
                                       friendly);
        if (pick == kInvalidId && ctx.state.chain.resuming.has_value() &&
            ctx.state.chain.resuming->resume_point == 7)
            return;  // suspended
        if (pick == kInvalidId || !ctx.state.objectExists(pick)) return;
        ctx.executor.buffUnit(pick);
        ctx.events.logTrace("KARMA CHANNELER: buffed a friendly unit on recycle");
    }
private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 548;
        d.def_id = R"RB(sfd-237-221)RB";
        d.name = R"RB(Karma, Channeler)RB";
        d.set_code = R"RB(SFD)RB";
        d.set_name = R"RB(Spiritforged)RB";
        d.public_code = R"RB(SFD-237/221)RB";
        d.collector_number = 237;
        d.artist = R"RB(Andres Blanco)RB";
        d.card_type = CardType::Unit;
        d.super_type = SuperType::Champion;
        d.domains = {Domain::Order};
        d.tags = {R"RB(Karma)RB"};
        d.energy_cost = 6;
        d.power_cost = 1;
        d.might = 6;
        d.rarity = Rarity::Showcase;
        d.keywords.set(Keyword::Vision);
        d.ability_text = R"RB([Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)
When you recycle one or more cards to your Main Deck, buff a friendly unit. (If it doesn't have a buff, it gets a +1 [M] buff. Runes aren't cards.))RB";
        d.image_url = R"RB(https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/ba0113d449813c94534ae0e74f3ef38f9b8010c2-744x1039.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_548(CardRegistry& r) {
    r.registerCard(548, std::make_unique<KarmaChanneler>());
}

} // namespace riftbound
