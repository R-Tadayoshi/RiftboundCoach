#include "cards/card_helpers.h"

#include <memory>
#include <string>
#include <vector>

namespace riftbound {
namespace {

/// Shadow Order Disciple (VEN-095/166)
///
///   When I move, you may [Burn 1] to give me +1 [M] this turn.
///
/// Every move, not just the first — compare Blade Twirler, which says "the
/// first time I move each turn" and needs the moves_this_turn guard. This
/// one does not, and adding the guard anyway would quietly cost a Ganking
/// line a point of Might.
///
/// [Burn 1] here is a COST, not an effect: "you may Burn 1 TO give me +1".
/// So it is only offered while there is a card to burn. An empty Main Deck
/// makes the ability unpayable, and offering it anyway would let the agent
/// pick a line that pays nothing and gets nothing — the kind of option that
/// looks like a free +1 in a search.
class ShadowOrderDisciple : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<TriggerType> triggerTypes() const override {
        return {TriggerType::WhenIMove};
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;

        const int yes = confirmOptional(
            ctx, "Shadow Order Disciple: Burn 1 for +1 [M] this turn",
            [&ctx]() {
                return ctx.state.objectExists(ctx.source) &&
                       !ctx.state.player(ctx.controller).main_deck.empty();
            });
        if (yes <= 0) return;   // -1 yielded for agent input, 0 declined/illegal

        ctx.executor.burnCards(ctx.controller, 1);
        ctx.executor.giveTemporaryMight(ctx.source, 1);
        ctx.events.logTrace("SHADOW ORDER DISCIPLE: burned 1 -> +1 [M] this turn");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 882;
        d.def_id = R"RB(ven-095-166)RB";
        d.name = R"RB(Shadow Order Disciple)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-095/166)RB";
        d.collector_number = 95;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Chaos};
        d.energy_cost = 2;
        d.might = 2;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(When I move, you may [Burn 1] to give me +1 :rb_might: this turn. (To Burn 1, put the top card of your Main Deck into your trash.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-095-166-6a347713d086afd3.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_882(CardRegistry& r) {
    r.registerCard(882, std::make_unique<ShadowOrderDisciple>());
}

} // namespace riftbound
