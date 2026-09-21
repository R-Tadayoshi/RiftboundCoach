#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Oasis Raider (VEN-006/166)
///
///   If you control fewer runes than an opponent at the start of your
///   Beginning Phase, give me +2 [M] and [Ganking] this turn.
///
/// Forsaken Baccai's catch-up clause with mobility attached, and [Ganking]
/// is the half that matters: being able to leave the battlefield you are
/// losing is worth more than the two Might.
///
/// The generated stub carried [Ganking] on the CardDef, because the
/// generator reads keywords out of printed text and this one sits behind a
/// condition — a different gate from the [Empowered] one it now skips, but
/// the same mistake: a Raider that can always move is a strictly better card
/// than the one printed, and only pays out when behind.
class OasisRaider : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::AtStartOfBeginning; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!behindOnRunes(ctx.state, ctx.controller)) return;
        ctx.executor.giveTemporaryMight(ctx.source, 2);
        ctx.executor.giveTemporaryKeyword(ctx.source, Keyword::Ganking, 1);
        ctx.events.logTrace("OASIS RAIDER: behind on runes -> +2[M] and [Ganking] this turn");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 793;
        d.def_id = R"RB(ven-006-166)RB";
        d.name = R"RB(Oasis Raider)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-006/166)RB";
        d.collector_number = 6;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 4;
        d.might = 4;
        d.rarity = Rarity::Common;
        // NOT keywords.set(Ganking) — it is granted only while behind.
        d.ability_text = R"RB(If you control fewer runes than an opponent at the start of your Beginning Phase, give me +2 :rb_might: and [Ganking] this turn. (I can move from battlefield to battlefield.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-006-166-39504a42422b4cd6.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_793(CardRegistry& r) {
    r.registerCard(793, std::make_unique<OasisRaider>());
}

} // namespace riftbound
