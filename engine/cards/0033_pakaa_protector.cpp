#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Pakaa Protector (VEN-033/166)
///
///   When I move, reveal the top card of your Main Deck. If it's a unit,
///   draw it. Otherwise, put it in your trash and give me +2 [M] this turn.
///
/// No choice in it — the deck decides — so there is nothing to publish and
/// the whole thing resolves inline. Worth noting, because most cards that
/// look at the top of a deck DO publish a choice and the machinery is right
/// there.
///
/// Either branch is a payout: a unit is card advantage, anything else is a
/// combat trick that arrived on a move. The card only ever costs you the
/// non-unit card it trashes.
///
/// The reveal itself is public information both players are entitled to, so
/// it is traced by name. That is the one place in this project where naming
/// a card from a deck is correct: the card says to reveal it.
class PakaaProtector : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenIMove; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        auto& ps = ctx.state.player(ctx.controller);
        if (ps.main_deck.empty()) {
            ctx.events.logTrace("PAKAA PROTECTOR: main deck is empty — nothing to reveal");
            return;
        }
        const auto top = ps.main_deck.back();
        if (!ctx.state.objectExists(top)) return;

        const bool is_unit = ctx.state.getObject(top).isUnit();
        ctx.events.logTrace("PAKAA PROTECTOR: revealed " +
                             ctx.state.getObject(top).name +
                             (is_unit ? " (unit — drawn)" : " (not a unit — trashed)"));

        if (is_unit) {
            ctx.executor.drawCards(ctx.controller, 1);
            return;
        }

        ps.main_deck.pop_back();
        auto& obj = ctx.state.getObject(top);
        obj.zone = ZoneType::Trash;
        obj.location = std::nullopt;
        ctx.state.player(obj.owner).trash.push_back(top);
        ctx.executor.giveTemporaryMight(ctx.source, 2);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 820;
        d.def_id = R"RB(ven-033-166)RB";
        d.name = R"RB(Pakaa Protector)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-033/166)RB";
        d.collector_number = 33;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 5;
        d.might = 4;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(When I move, reveal the top card of your Main Deck. If it's a unit, draw it. Otherwise, put it in your trash and give me +2 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-033-166-c3d51edc146465fb.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_820(CardRegistry& r) {
    r.registerCard(820, std::make_unique<PakaaProtector>());
}

} // namespace riftbound
