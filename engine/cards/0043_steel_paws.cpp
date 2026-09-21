#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Steel Paws (VEN-043/166)
///
///   [Deflect]
///   [Empower] [7]
///   [Empowered][>] I have +7 [M].
///
/// A 0-Might [Deflect] body for [1] that becomes a 7 for [7] more. [Deflect]
/// is printed on the card, so it comes from the CardDef and is NOT part of
/// the Empowered buff — only the +7 is conditional. Folding the Deflect into
/// the buff would silently remove it from the un-Empowered body, which is the
/// half of the card you actually play on turn one.
class SteelPaws : public EmpoweredSelfBuff {
public:
    const CardDef& def() const override { return def_; }

protected:
    ActivationCost empowerCost() const override { return {.energy = 7}; }

    std::vector<GameObject::AuraEffect> empoweredAuras() const override {
        GameObject::AuraEffect ae;
        ae.might_bonus = 7;
        return {ae};
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 830;
        d.def_id = R"RB(ven-043-166)RB";
        d.name = R"RB(Steel Paws)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-043/166)RB";
        d.collector_number = 43;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 1;
        d.might = 0;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Deflect);
        d.deflect_value = 1;
        d.ability_text = R"RB([Deflect] (Opponents must pay :rb_rune_rainbow: to choose me with a spell or ability.)[Empower] :rb_energy_7: (:rb_energy_7:: Empower me. Use only if not Empowered.)[Empowered][>] I have +7 :rb_might:.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-043-166-70534fd1ae32fe81.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_830(CardRegistry& r) {
    r.registerCard(830, std::make_unique<SteelPaws>());
}

} // namespace riftbound
