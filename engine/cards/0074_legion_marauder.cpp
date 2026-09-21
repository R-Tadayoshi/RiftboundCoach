#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Legion Marauder (VEN-074/166)
///
///   [Empower] — [1] or [Body]
///   [Empowered][>] I have +1 [M].
///
/// "or" is the interesting part. ActivationCost describes ONE cost, with no
/// way to say "either of these", so the choice is expressed as two abilities
/// that do the same thing at different prices. The action generator already
/// filters each by affordability, so a player who can pay only one is
/// offered only that one, and a player who can pay both gets the real choice
/// — which is what the card says.
///
/// Folding it into a single energy cost would be simpler and wrong: a deck
/// with Body power and no spare energy could not Empower at all.
///
/// Both abilities are gated on not being Empowered, so once it is wound up
/// neither is offered.
class LegionMarauder : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {
            empowerAbility({.energy = 1}),                                  // 0
            empowerAbility({.power = 1, .power_domain = Domain::Body}),     // 1
        };
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int /*ability_index*/) const override {
        return !isEmpowered(state, self);   // both forms, same gate
    }

    void onActivate(CardContext& ctx, int /*ability_index*/,
                    const std::vector<GameObjectId>&) override {
        empowerObject(ctx, ctx.source);
    }

    void applyPassiveAura(GameState& state, PlayerId /*controller*/,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        auto& obj = state.getObject(self);
        if (!obj.is_empowered) return;
        GameObject::AuraEffect ae;
        ae.source = self;
        ae.might_bonus = 1;
        obj.aura_effects.push_back(ae);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 861;
        d.def_id = R"RB(ven-074-166)RB";
        d.name = R"RB(Legion Marauder)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-074/166)RB";
        d.collector_number = 74;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Body};
        d.energy_cost = 2;
        d.might = 2;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB([Empower] — :rb_energy_1: or :rb_rune_body: (Pay either cost: Empower me. Use only if not Empowered.)[Empowered][>] I have +1 :rb_might:.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-074-166-51d7d4fec92af118.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_861(CardRegistry& r) {
    r.registerCard(861, std::make_unique<LegionMarauder>());
}

} // namespace riftbound
