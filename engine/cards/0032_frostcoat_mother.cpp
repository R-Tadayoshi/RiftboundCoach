#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Frostcoat Mother (VEN-032/166)
///
///   [Empower] [12]. This ability costs [1] less for each rune you control.
///   [Empowered][>] I have +3 [M].
///
/// The [12] is theatre: nobody pays it. The card is "Empower me for
/// (12 - runes)", which on a normal board is a few energy late or free very
/// late, and that curve is the whole card. A search that saw a flat [12]
/// would never once consider it.
///
/// Runes YOU control, counted on the board — a rune in hand is not one you
/// control. Exhausted ones still count: the clause is about how many you
/// have, not how many are available.
class FrostcoatMother : public EmpoweredSelfBuff {
public:
    const CardDef& def() const override { return def_; }

    int activationCostReduction(const GameState& state, PlayerId controller,
                                int ability_index) const override {
        if (ability_index != 0) return 0;
        return runesControlled(state, controller);
    }

protected:
    ActivationCost empowerCost() const override { return {.energy = 12}; }

    std::vector<GameObject::AuraEffect> empoweredAuras() const override {
        GameObject::AuraEffect ae;
        ae.might_bonus = 3;
        return {ae};
    }

private:
    static int runesControlled(const GameState& state, PlayerId controller) {
        int n = 0;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isRune()) continue;
            if (obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
            ++n;
        }
        return n;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 819;
        d.def_id = R"RB(ven-032-166)RB";
        d.name = R"RB(Frostcoat Mother)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-032/166)RB";
        d.collector_number = 32;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 3;
        d.might = 3;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB([Empower] :rb_energy_12:. This ability costs :rb_energy_1: less for each rune you control. (Pay the cost: Empower me. Use only if not Empowered.)[Empowered][>] I have +3 :rb_might:.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-032-166-4673357e85b7cb5d.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_819(CardRegistry& r) {
    r.registerCard(819, std::make_unique<FrostcoatMother>());
}

} // namespace riftbound
