#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Kinkou Lifeblade (VEN-093/166)
///
///   [Empower] [2]
///   [Empowered][>] I have +1 [M] and [Ganking].
///
/// Brutal Hunter's shape at a lower price and a smaller buff. Same gated
/// [Ganking], same generated stub that carried it unconditionally.
class KinkouLifeblade : public EmpoweredSelfBuff {
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
        a1.keyword = Keyword::Ganking;
        a1.keyword_value = 1;
        out.push_back(a1);
        return out;
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 880;
        d.def_id = R"RB(ven-093-166)RB";
        d.name = R"RB(Kinkou Lifeblade)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-093/166)RB";
        d.collector_number = 93;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Chaos};
        d.energy_cost = 4;
        d.might = 4;
        d.rarity = Rarity::Common;
        // NOT keywords.set(...) — gated on [Empowered], see the class comment.
        d.ability_text = R"RB([Empower] :rb_energy_2: (:rb_energy_2:: Empower me. Use only if not Empowered.)[Empowered][>] I have +1 :rb_might: and [Ganking]. (I can move from battlefield to battlefield.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-093-166-d090211b12d76838.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_880(CardRegistry& r) {
    r.registerCard(880, std::make_unique<KinkouLifeblade>());
}

} // namespace riftbound
