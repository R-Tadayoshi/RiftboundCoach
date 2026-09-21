#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Solari Sunhawk (VEN-122/166)
///
///   [Empower] [2]
///   [Empowered][>] I have +1 [M] and [Deflect 2].
///
/// [Deflect 2] is a targeting tax of two rainbow power, and the engine does
/// not charge it anywhere yet — deflect_value is rendered and fed to the
/// feature extractor and never read at targeting time. The magnitude is
/// carried here so the card is right the day that is wired, rather than
/// needing to be found again.
class SolariSunhawk : public EmpoweredSelfBuff {
public:
    const CardDef& def() const override { return def_; }

protected:
    ActivationCost empowerCost() const override { return {.energy = 2}; }

    std::vector<GameObject::AuraEffect> empoweredAuras() const override {
        std::vector<GameObject::AuraEffect> out;
        GameObject::AuraEffect a0;
        a0.might_bonus = 1;
        out.push_back(a0);
        GameObject::AuraEffect a1;
        a1.keyword = Keyword::Deflect;
        a1.keyword_value = 2;
        out.push_back(a1);
        return out;
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 909;
        d.def_id = R"RB(ven-122-166)RB";
        d.name = R"RB(Solari Sunhawk)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-122/166)RB";
        d.collector_number = 122;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Order};
        d.energy_cost = 3;
        d.might = 3;
        d.rarity = Rarity::Common;
        // NOT keywords.set(...) — gated on [Empowered], see the class comment.
        d.ability_text = R"RB([Empower] :rb_energy_2: (:rb_energy_2:: Empower me. Use only if not Empowered.)[Empowered][>] I have +1 :rb_might: and [Deflect 2]. (Opponents must pay :rb_rune_rainbow::rb_rune_rainbow: to choose me with a spell or ability.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-122-166-42876032b815a04d.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_909(CardRegistry& r) {
    r.registerCard(909, std::make_unique<SolariSunhawk>());
}

} // namespace riftbound
