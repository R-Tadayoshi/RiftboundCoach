#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Iterative Design (VEN-051/166)
///
///   Play a 3 [M] Mech unit token.
///   [Flow] [2][Mind]
///
/// The Flow cost is cheaper than the printed cost, which is the shape of the
/// whole cycle: the card is worse the first time and better the second. A
/// search that only ever sees the printed cost undervalues holding it.
class IterativeDesign : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    FlowCost flowCost() const override {
        return {.valid = true, .energy = 2, .power = 1, .power_domain = Domain::Mind};
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>&) override {
        LocationId loc{BaseLocation{ctx.controller}};
        ctx.executor.createToken(ctx.controller, CardType::Unit, "Mech",
                                  3, {"Mech"}, KeywordSet{}, loc,
                                  /*enter_ready=*/false);
        ctx.events.logTrace("ITERATIVE DESIGN: 3[M] Mech token at base");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 838;
        d.def_id = R"RB(ven-051-166)RB";
        d.name = R"RB(Iterative Design)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-051/166)RB";
        d.collector_number = 51;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Mind};
        d.energy_cost = 4;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(Play a 3 :rb_might: Mech unit token.[Flow] :rb_energy_2::rb_rune_mind: (You may play this from your trash for its Flow cost. Then banish it.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-051-166-6ad74a17ade09309.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_838(CardRegistry& r) {
    r.registerCard(838, std::make_unique<IterativeDesign>());
}

} // namespace riftbound
