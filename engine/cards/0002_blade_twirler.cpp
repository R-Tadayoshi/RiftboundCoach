#include "cards/card_helpers.h"

#include <memory>
#include <string>
#include <vector>

namespace riftbound {
namespace {

/// Blade Twirler (VEN-002/166)
///
///   The first time I move each turn, choose a player. They [Burn 1].
///
/// "THE FIRST TIME ... EACH TURN" is the whole card. A unit with [Ganking]
/// can move several times in a turn, and a Blade Twirler that burned on
/// every move would read as a mill engine rather than a 4-cost 4-Might body.
/// GameObject::moves_this_turn is incremented inside GameEngine::moveUnit,
/// which runs before the UnitMovedEvent that fires this trigger, so the
/// first move is the one where the count reads exactly 1.
///
/// "CHOOSE A PLAYER" — either player, including yourself. That is not a
/// dead option: burning your own top card is how you put a [Flow] spell or
/// a reanimation target into your trash on purpose, so both modes are
/// always offered and the search decides.
class BladeTwirler : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<TriggerType> triggerTypes() const override {
        return {TriggerType::WhenIMove};
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        if (ctx.state.getObject(ctx.source).moves_this_turn != 1) {
            // A later move this turn. Silent, not a failure.
            return;
        }

        const PlayerId me = ctx.controller;
        const PlayerId them = opponent(me);

        const int mode = pickMode(ctx, "Blade Twirler: choose a player to Burn 1",
                                  /*num_modes=*/2,
                                  {"Opponent Burns 1", "You Burn 1"},
                                  /*legal_modes=*/0b11);
        if (mode < 0) return;   // -1 yielded for agent input, -2 no legal mode

        const PlayerId victim = (mode == 0) ? them : me;
        ctx.executor.burnCards(victim, 1);
        ctx.events.logTrace(std::string("BLADE TWIRLER: first move this turn -> ") +
                             toString(victim) + " Burns 1");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 789;
        d.def_id = R"RB(ven-002-166)RB";
        d.name = R"RB(Blade Twirler)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-002/166)RB";
        d.collector_number = 2;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 4;
        d.might = 4;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(The first time I move each turn, choose a player. They [Burn 1]. (They put the top card of their Main Deck into their trash.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-002-166-d6cc75b92c3454c6.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_789(CardRegistry& r) {
    r.registerCard(789, std::make_unique<BladeTwirler>());
}

} // namespace riftbound
