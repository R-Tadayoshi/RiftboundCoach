#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Grumpy Rockbear (VEN-050/166)
///
///   [Empower] [12]. This ability costs [1] less for each rune you control.
///   [Empowered][>] I have [Deflect] and [Shield 3].
///
/// Frostcoat Mother's curve with a defensive payoff. Both keywords are gated,
/// so neither is on the CardDef — the generated stub had both, which made an
/// un-Empowered 4-cost 4/4 into a 4/7-on-defence with a targeting tax, for
/// free.
class GrumpyRockbear : public EmpoweredSelfBuff {
public:
    const CardDef& def() const override { return def_; }

    int activationCostReduction(const GameState& state, PlayerId controller,
                                int ability_index) const override {
        if (ability_index != 0) return 0;
        int n = 0;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isRune()) continue;
            if (obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
            ++n;
        }
        return n;
    }

protected:
    ActivationCost empowerCost() const override { return {.energy = 12}; }

    std::vector<GameObject::AuraEffect> empoweredAuras() const override {
        GameObject::AuraEffect deflect;
        deflect.keyword = Keyword::Deflect;
        deflect.keyword_value = 1;
        GameObject::AuraEffect shield;
        shield.keyword = Keyword::Shield;
        shield.keyword_value = 3;
        return {deflect, shield};
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 837;
        d.def_id = R"RB(ven-050-166)RB";
        d.name = R"RB(Grumpy Rockbear)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-050/166)RB";
        d.collector_number = 50;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Mind};
        d.energy_cost = 4;
        d.might = 4;
        d.rarity = Rarity::Common;
        // NOT keywords.set(Deflect/Shield) — both are gated on [Empowered].
        d.ability_text = R"RB([Empower] :rb_energy_12:. This ability costs :rb_energy_1: less for each rune you control. (Pay the cost: Empower me. Use only if not Empowered.)[Empowered][>] I have [Deflect] and [Shield 3]. (Opponents must pay :rb_rune_rainbow: to choose me with a spell or ability.+3 :rb_might: while I'm a defender.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-050-166-121759380fe6d41c.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_837(CardRegistry& r) {
    r.registerCard(837, std::make_unique<GrumpyRockbear>());
}

} // namespace riftbound
