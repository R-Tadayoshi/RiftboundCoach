#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Serene Ascetic (VEN-030/166)
///
///   [Empower] [3]
///   [Empowered][>] I have [Deflect] and [Shield 3].
///
/// Same generator artifact as Shadow Fiend, twice over: the stub carried
/// Deflect and Shield 3 on the CardDef, which would make a 3-cost 3/3 into a
/// 3-cost 3/6-on-defence with a targeting tax, before paying the [3]. Both
/// move into the Empowered aura.
class SereneAscetic : public EmpoweredSelfBuff {
public:
    const CardDef& def() const override { return def_; }

protected:
    ActivationCost empowerCost() const override { return {.energy = 3}; }

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
        d.id = 817;
        d.def_id = R"RB(ven-030-166)RB";
        d.name = R"RB(Serene Ascetic)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-030/166)RB";
        d.collector_number = 30;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 3;
        d.might = 3;
        d.rarity = Rarity::Common;
        // NOT keywords.set(Deflect/Shield) — both are gated on [Empowered].
        d.ability_text = R"RB([Empower] :rb_energy_3: (:rb_energy_3:: Empower me. Use only if not Empowered.)[Empowered][>] I have [Deflect] and [Shield 3]. (Opponents must pay :rb_rune_rainbow: to choose me with a spell or ability.+3 :rb_might: while I'm a defender.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-030-166-2598353b63827011.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_817(CardRegistry& r) {
    r.registerCard(817, std::make_unique<SereneAscetic>());
}

} // namespace riftbound
