#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Forsaken Baccai (VEN-005/166)
///
///   If you control fewer runes than an opponent at the start of your
///   Beginning Phase, give me +1 [M] this turn.
///
/// A catch-up card: it pays out only while you are behind on runes, and
/// stops the turn you draw level. "Fewer than AN OPPONENT" is fewer than
/// any one of them, which in a two-player game is just the other player.
///
/// Checked at the start of the Beginning Phase and granted for the turn, so
/// channelling back to parity later in the turn does not take the buff away
/// — the condition is a snapshot, not a continuous aura.
class ForsakenBaccai : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::AtStartOfBeginning; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!behindOnRunes(ctx.state, ctx.controller)) return;
        ctx.executor.giveTemporaryMight(ctx.source, 1);
        ctx.events.logTrace("FORSAKEN BACCAI: behind on runes -> +1[M] this turn");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 792;
        d.def_id = R"RB(ven-005-166)RB";
        d.name = R"RB(Forsaken Baccai)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-005/166)RB";
        d.collector_number = 5;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 2;
        d.might = 2;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(If you control fewer runes than an opponent at the start of your Beginning Phase, give me +1 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-005-166-9024b5d89a18a5e8.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_792(CardRegistry& r) {
    r.registerCard(792, std::make_unique<ForsakenBaccai>());
}

} // namespace riftbound
