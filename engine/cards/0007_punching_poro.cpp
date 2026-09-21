#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Punching Poro (VEN-007/166)
///
///   [Empower] — Discard 1
///   [Empowered][>] I have +1 [M].
///
/// The whole card is the EmpoweredSelfBuff shape, which is why that base
/// exists: wind it up once, keep the buff. The cost is a discard rather than
/// energy, which is the only thing that distinguishes it from a dozen others
/// in the set.
class PunchingPoro : public EmpoweredSelfBuff {
public:
    const CardDef& def() const override { return def_; }

protected:
    ActivationCost empowerCost() const override {
        return {.discard = true, .discard_count = 1};
    }

    std::vector<GameObject::AuraEffect> empoweredAuras() const override {
        GameObject::AuraEffect ae;
        ae.might_bonus = 1;
        return {ae};
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 794;
        d.def_id = R"RB(ven-007-166)RB";
        d.name = R"RB(Punching Poro)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-007/166)RB";
        d.collector_number = 7;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 2;
        d.might = 2;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB([Empower] — Discard 1 (Pay the cost: Empower me. Use only if not Empowered.)[Empowered][>] I have +1 :rb_might:.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-007-166-928dac4d45766aeb.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_794(CardRegistry& r) {
    r.registerCard(794, std::make_unique<PunchingPoro>());
}

} // namespace riftbound
