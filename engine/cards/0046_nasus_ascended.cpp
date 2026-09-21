#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Nasus, Ascended (VEN-046/166)
///
///   [Deflect 2]
///   [Empower] [8]
///   [Empowered][>] When I conquer, you score 1 point.
///
/// [Deflect 2] is printed outright and belongs on the CardDef; only the
/// scoring clause is behind the gate. The generator gets this one right
/// because the Deflect appears before the first [Empowered].
///
/// THE POINT IS THE WHOLE CARD, and it is gated twice over — Empowered, and
/// conquering. Eight energy to play and eight more to empower is two turns
/// of everything, so the trigger checks the latch at FIRE time rather than
/// trusting that a card which empowered itself stays Empowered: Tomb-Raider
/// Barbara and Profiteer both disempower, and a point scored off a latch
/// that was cleared is a point the game did not award.
///
/// "You score 1 point", not "score 1 point on this battlefield" — it is a
/// flat point to the controller, unaffected by the once-per-battlefield
/// conquest rule, the same reading Shen, Leader of the Kinkou Order takes.
class NasusAscended : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {empowerAbility({.energy = 8})};
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, /*empower_index=*/0, {});
    }

    void onActivate(CardContext& ctx, int ability_index,
                    const std::vector<GameObjectId>&) override {
        if (ability_index == 0) empowerObject(ctx, ctx.source);
    }

    TriggerType triggerType() const override { return TriggerType::WhenIConquer; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!isEmpowered(ctx.state, ctx.source)) {
            ctx.events.logTrace("NASUS, ASCENDED: conquered but not [Empowered] "
                                 "-> no point");
            return;
        }
        auto& ps = ctx.state.player(ctx.controller);
        ps.score++;
        ctx.events.logTrace("NASUS, ASCENDED: [Empowered] conquest -> scored 1 -> " +
                             std::to_string(ps.score));
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 833;
        d.def_id = R"RB(ven-046-166)RB";
        d.name = R"RB(Nasus, Ascended)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-046/166)RB";
        d.collector_number = 46;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 8;
        d.power_cost = 1;
        d.might = 8;
        d.rarity = Rarity::Epic;
        d.keywords.set(Keyword::Deflect);
        d.deflect_value = 2;
        d.ability_text = R"RB([Deflect 2] (Opponents must pay :rb_rune_rainbow::rb_rune_rainbow: to choose me with a spell or ability.)[Empower] :rb_energy_8: (:rb_energy_8:: Empower me. Use only if not Empowered.)[Empowered][>] When I conquer, you score 1 point.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-046-166-24f2768f05dfd827.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_833(CardRegistry& r) {
    r.registerCard(833, std::make_unique<NasusAscended>());
}

} // namespace riftbound
