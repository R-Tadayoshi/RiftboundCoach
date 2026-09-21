#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Shadow Fiend (VEN-014/166)
///
///   [Empower] [2][Fury]
///   [Empowered][>] I have [Assault 3].
///
/// The generated stub carried `keywords.set(Keyword::Assault)` and
/// `assault_value = 3` on the CardDef, because coach/gen-cards.js reads the
/// keywords out of the printed text and cannot see that these two sit behind
/// "[Empowered][>]". Left there, an un-Empowered Shadow Fiend attacks as a 5
/// for [2][Fury] — strictly better than the card, and wrong in the direction
/// a search will happily exploit.
///
/// So the Assault lives in the Empowered aura and nowhere else.
class ShadowFiend : public EmpoweredSelfBuff {
public:
    const CardDef& def() const override { return def_; }

protected:
    ActivationCost empowerCost() const override {
        return {.energy = 2, .power = 1, .power_domain = Domain::Fury};
    }

    std::vector<GameObject::AuraEffect> empoweredAuras() const override {
        GameObject::AuraEffect ae;
        ae.keyword = Keyword::Assault;
        ae.keyword_value = 3;
        return {ae};
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 801;
        d.def_id = R"RB(ven-014-166)RB";
        d.name = R"RB(Shadow Fiend)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-014/166)RB";
        d.collector_number = 14;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 2;
        d.might = 2;
        d.rarity = Rarity::Uncommon;
        // NOT keywords.set(Assault) / assault_value — see the class comment.
        d.ability_text = R"RB([Empower] :rb_energy_2::rb_rune_fury: (:rb_energy_2::rb_rune_fury:: Empower me. Use only if not Empowered.)[Empowered][>] I have [Assault 3]. (+3 :rb_might: while I'm an attacker.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-014-166-eabd0a3b285bcbd5.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_801(CardRegistry& r) {
    r.registerCard(801, std::make_unique<ShadowFiend>());
}

} // namespace riftbound
