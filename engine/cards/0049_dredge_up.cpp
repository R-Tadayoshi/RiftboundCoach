#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Dredge Up (VEN-049/166)
///
///   Draw 1.
///   [Flow] [2]  (You may play this from your trash for its Flow cost. Then
///                banish it.)
///
/// The simplest possible Flow card, which is why it is the one to get right
/// first: a two-energy cantrip that later costs two energy again out of the
/// trash, once. The banish is the engine's job (GameEngine::payFlowCost marks
/// the object, ChainManager banishes it on disposal), so the card only
/// declares the cost — and declaring it is what makes the play legal at all.
class DredgeUp : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    FlowCost flowCost() const override {
        return {.valid = true, .energy = 2};
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>&) override {
        ctx.executor.drawCards(ctx.controller, 1);
        ctx.events.logTrace("DREDGE UP: draw 1");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 836;
        d.def_id = R"RB(ven-049-166)RB";
        d.name = R"RB(Dredge Up)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-049/166)RB";
        d.collector_number = 49;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Mind};
        d.energy_cost = 2;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(Draw 1.[Flow] :rb_energy_2: (You may play this from your trash for its Flow cost. Then banish it.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-049-166-b16c98ccd4282f9a.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_836(CardRegistry& r) {
    r.registerCard(836, std::make_unique<DredgeUp>());
}

} // namespace riftbound
