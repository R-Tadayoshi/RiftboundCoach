#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Shen, Leader of the Kinkou Order (VEN-138/166)
///
///   [Shield]
///   When I hold, if there is exactly one other unit you control here, you
///   score 1 point.
///
/// The same "exactly one other unit here" condition as Shen, Scourge of
/// Shadows, paying a point instead of a card — the pair is clearly designed
/// to be read together, and both are narrow in both directions: alone
/// nothing happens, and in a crowd nothing happens either.
///
/// Scoring straight onto PlayerState::score, which is the idiom every other
/// card-side scorer uses (Trinity Force, Power Nexus). That deliberately
/// bypasses GameEngine::scoreHold's gates — this is not a hold score, it is
/// a point the card grants for having held — so the "once per battlefield
/// per turn" rule does not apply to it and should not.
class ShenLeaderOfTheKinkouOrder : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenIHold; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        const auto here = ctx.state.getObject(ctx.source).battlefieldId();
        if (!here) return;

        int others = 0;
        for (auto& [id, obj] : ctx.state.objects) {
            if (id == ctx.source) continue;
            if (!obj.isUnit() || obj.controller != ctx.controller) continue;
            auto bf = obj.battlefieldId();
            if (!bf || *bf != *here) continue;
            ++others;
        }
        if (others != 1) {
            ctx.events.logTrace("SHEN, LEADER OF THE KINKOU ORDER: " +
                                 std::to_string(others) +
                                 " other friendly units here — needs exactly 1");
            return;
        }
        auto& ps = ctx.state.player(ctx.controller);
        ps.score++;
        ctx.events.logTrace("SHEN, LEADER OF THE KINKOU ORDER: scored 1 -> " +
                             std::to_string(ps.score));
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 925;
        d.def_id = R"RB(ven-138-166)RB";
        d.name = R"RB(Shen, Leader of the Kinkou Order)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-138/166)RB";
        d.collector_number = 138;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Order};
        d.energy_cost = 6;
        d.power_cost = 2;
        d.might = 7;
        d.rarity = Rarity::Epic;
        d.keywords.set(Keyword::Shield);
        d.shield_value = 1;
        d.ability_text = R"RB([Shield] (+1 :rb_might: while I'm a defender.)When I hold, if there is exactly one other unit you control here, you score 1 point.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-138-166-fc0e9ee3ba5a096f.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_925(CardRegistry& r) {
    r.registerCard(925, std::make_unique<ShenLeaderOfTheKinkouOrder>());
}

} // namespace riftbound
