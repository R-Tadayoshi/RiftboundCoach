#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Brutal Hunter (VEN-070/166)
///
///   [Empower] [3]
///   [Empowered][>] I have +2 [M] and [Ganking].
///
/// [Ganking] is the half that matters: a unit that cannot leave the
/// battlefield it was played to is a different card from one that can, and
/// the +2 is the smaller part of the upgrade. Both are gated, so neither is
/// on the CardDef — the generated stub had Ganking unconditionally, which is
/// mobility this card has not paid for.
class BrutalHunter : public EmpoweredSelfBuff {
public:
    const CardDef& def() const override { return def_; }

protected:
    ActivationCost empowerCost() const override { return {.energy = 3}; }

    std::vector<GameObject::AuraEffect> empoweredAuras() const override {
        std::vector<GameObject::AuraEffect> out;
        GameObject::AuraEffect a0;
        a0.might_bonus = 2;
        out.push_back(a0);
        GameObject::AuraEffect a1;
        a1.keyword = Keyword::Ganking;
        a1.keyword_value = 1;
        out.push_back(a1);
        return out;
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 857;
        d.def_id = R"RB(ven-070-166)RB";
        d.name = R"RB(Brutal Hunter)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-070/166)RB";
        d.collector_number = 70;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Body};
        d.energy_cost = 3;
        d.power_cost = 1;
        d.might = 4;
        d.rarity = Rarity::Common;
        // NOT keywords.set(...) — gated on [Empowered], see the class comment.
        d.ability_text = R"RB([Empower] :rb_energy_3: (:rb_energy_3:: Empower me. Use only if not Empowered.)[Empowered][>] I have +2 :rb_might: and [Ganking]. (I can move from battlefield to battlefield.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-070-166-f7484bcf55355c38.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_857(CardRegistry& r) {
    r.registerCard(857, std::make_unique<BrutalHunter>());
}

} // namespace riftbound
