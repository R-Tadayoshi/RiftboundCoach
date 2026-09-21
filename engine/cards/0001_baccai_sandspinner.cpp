#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Baccai Sandspinner (VEN-001/166)
///
///   [Empower] [5]. This ability costs [3] less if you control 4 or fewer
///   runes.
///   [Empowered][>] I have [Deflect] and [Assault 2].
///
/// The discount runs the OTHER way from Frostcoat Mother's: cheap while you
/// are behind on runes, full price once you are not. So it is an early play
/// that gets worse, rather than a late one that gets better, and the two
/// should not be ranked by the same intuition even though both read
/// "[Empower] N, costs less".
///
/// Both keywords are gated, so neither is on the CardDef; the generated stub
/// had both, which handed an un-Empowered 6-cost 6/6 a targeting tax and +2
/// on the attack for nothing.
class BaccaiSandspinner : public EmpoweredSelfBuff {
public:
    const CardDef& def() const override { return def_; }

    int activationCostReduction(const GameState& state, PlayerId controller,
                                int ability_index) const override {
        if (ability_index != 0) return 0;
        int runes = 0;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isRune()) continue;
            if (obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
            ++runes;
        }
        return runes <= 4 ? 3 : 0;
    }

protected:
    ActivationCost empowerCost() const override { return {.energy = 5}; }

    std::vector<GameObject::AuraEffect> empoweredAuras() const override {
        GameObject::AuraEffect deflect;
        deflect.keyword = Keyword::Deflect;
        deflect.keyword_value = 1;
        GameObject::AuraEffect assault;
        assault.keyword = Keyword::Assault;
        assault.keyword_value = 2;
        return {deflect, assault};
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 788;
        d.def_id = R"RB(ven-001-166)RB";
        d.name = R"RB(Baccai Sandspinner)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-001/166)RB";
        d.collector_number = 1;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 6;
        d.might = 6;
        d.rarity = Rarity::Common;
        // NOT keywords.set(Deflect/Assault) — both are gated on [Empowered].
        d.ability_text = R"RB([Empower] :rb_energy_5:. This ability costs :rb_energy_3: less if you control 4 or fewer runes. (Pay the cost: Empower me. Use only if not Empowered.)[Empowered][>] I have [Deflect] and [Assault 2]. (Opponents must pay :rb_rune_rainbow: to choose me with a spell or ability. +2 :rb_might: while I'm an attacker.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-001-166-376608d05f5062d2.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_788(CardRegistry& r) {
    r.registerCard(788, std::make_unique<BaccaiSandspinner>());
}

} // namespace riftbound
