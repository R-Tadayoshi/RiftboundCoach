#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Hextech Disc (VEN-087/166)
///
///   [Empower] — [E]
///   Disempower this, [1], [E]: Play a 3 [M] Mech unit token to your base.
///
/// Same two-ability shape as Questionable Tome, paying out a body instead of
/// a card. "To your base" is explicit on this one, so the token's location is
/// the card's text rather than the engine's default.
class HextechDisc : public GearCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {
            empowerAbility({.exhaust = true}),
            ActivatedAbility{.cost = {.exhaust = true, .energy = 1}},
        };
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, 0, {1});
    }

    void onActivate(CardContext& ctx, int ability_index,
                    const std::vector<GameObjectId>&) override {
        if (ability_index == 0) {
            empowerObject(ctx, ctx.source);
            return;
        }
        disempowerObject(ctx, ctx.source);
        LocationId loc{BaseLocation{ctx.controller}};
        ctx.executor.createToken(ctx.controller, CardType::Unit, "Mech",
                                  3, {"Mech"}, KeywordSet{}, loc,
                                  /*enter_ready=*/false);
        ctx.events.logTrace("HEXTECH DISC: disempowered -> 3[M] Mech token at base");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 874;
        d.def_id = R"RB(ven-087-166)RB";
        d.name = R"RB(Hextech Disc)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-087/166)RB";
        d.collector_number = 87;
        d.card_type = CardType::Gear;
        d.domains = {Domain::Body};
        d.energy_cost = 4;
        d.power_cost = 1;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB([Empower] — :rb_exhaust: (Pay the cost: Empower this. Use only if not Empowered.)Disempower this, :rb_energy_1:, :rb_exhaust:: Play a 3 :rb_might: Mech unit token to your base.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-087-166-67a493806fa469dc.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_874(CardRegistry& r) {
    r.registerCard(874, std::make_unique<HextechDisc>());
}

} // namespace riftbound
