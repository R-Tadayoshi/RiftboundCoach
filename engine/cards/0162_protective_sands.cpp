#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Protective Sands (VEN-162/166)
///
///   When you conquer here, if you control 4 or fewer runes, you may pay [1]
///   to draw 1.
///
/// A catch-up battlefield: it pays out only while you are behind on runes,
/// and the [1] it charges is real — on four runes or fewer that is a
/// quarter of your turn, so "may" is a genuine decision rather than a free
/// card.
///
/// Three things have to hold and they are checked in the order the card
/// prints them: conquered here, four or fewer runes, then the payment. The
/// optional confirm re-validates the rune count after the agent says yes,
/// so a "yes" given on a stale board cannot draw.
class ProtectiveSands : public BattlefieldCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenYouConquerHere; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        auto affordable = [&ctx]() {
            if (runesControlled(ctx.state, ctx.controller) > 4) return false;
            int ready = 0;
            const auto base = BaseLocation{ctx.controller};
            for (auto& [id, obj] : ctx.state.objects) {
                if (!obj.isRune() || obj.controller != ctx.controller) continue;
                if (obj.is_exhausted) continue;
                if (!obj.location.has_value() || *obj.location != LocationId{base}) continue;
                ++ready;
            }
            return ready >= 1;
        };

        if (!affordable()) return;
        const int answer = confirmOptional(ctx, "Protective Sands: pay [1] to draw 1?",
                                           affordable);
        if (answer == -1) return;   // waiting on the agent
        if (answer == 0) return;    // declined, or no longer legal

        if (!payEnergyFromRunes(ctx, 1)) return;
        ctx.executor.drawCards(ctx.controller, 1);
        ctx.events.logTrace("PROTECTIVE SANDS: paid [1] -> draw 1");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 949;
        d.def_id = R"RB(ven-162-166)RB";
        d.name = R"RB(Protective Sands)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-162/166)RB";
        d.collector_number = 162;
        d.card_type = CardType::Battlefield;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(When you conquer here, if you control 4 or fewer runes, you may pay :rb_energy_1: to draw 1.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-162-166-c942e77d75478f59.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_949(CardRegistry& r) {
    r.registerCard(949, std::make_unique<ProtectiveSands>());
}

} // namespace riftbound
