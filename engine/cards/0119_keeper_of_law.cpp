#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Keeper of Law (VEN-119/166)
///
///   I cost [2][Order] less if you control a battlefield with exactly two
///   units there.
///
/// TWO HALVES, PAID DIFFERENTLY. [2] is energy — exhaust two ready runes —
/// and [Order] is power, which recycles an exhausted Order rune instead
/// (CR 164.2). selfCostReduction only ever spoke for the energy half, so
/// this card is why selfPowerCostReduction exists: with the energy hook
/// alone it would read as a 3-cost on the board and still ask for the rune
/// at payment time.
///
/// "A BATTLEFIELD WITH EXACTLY TWO UNITS THERE" — two units, not two of
/// YOURS. The possessive is absent here and present on the cards that mean
/// it (Shadow Dash: "if you have exactly two units there"), so the count is
/// every unit at that battlefield whoever controls it. A contested
/// battlefield with one of each turns the discount on.
///
/// "YOU CONTROL" still binds the battlefield: an uncontrolled or enemy-held
/// battlefield with exactly two units does not count.
class KeeperOfLaw : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    int selfCostReduction(const GameState& state, PlayerId player) const override {
        return discountApplies(state, player) ? 2 : 0;
    }

    int selfPowerCostReduction(const GameState& state,
                               PlayerId player) const override {
        return discountApplies(state, player) ? 1 : 0;
    }

private:
    static bool discountApplies(const GameState& state, PlayerId player) {
        for (const auto& bf : state.battlefields) {
            if (!bf.controller.has_value() || *bf.controller != player) continue;
            int units = 0;
            for (const auto& [id, obj] : state.objects) {
                if (!obj.isUnit()) continue;
                if (!obj.location.has_value()) continue;
                const auto* at = std::get_if<BattlefieldLocation>(&*obj.location);
                if (!at || at->id != bf.id) continue;
                ++units;
                if (units > 2) break;
            }
            if (units == 2) return true;
        }
        return false;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 906;
        d.def_id = R"RB(ven-119-166)RB";
        d.name = R"RB(Keeper of Law)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-119/166)RB";
        d.collector_number = 119;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Order};
        d.energy_cost = 5;
        d.power_cost = 1;
        d.might = 5;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(I cost :rb_energy_2::rb_rune_order: less if you control a battlefield with exactly two units there.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-119-166-0fae72427fcdb6f3.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_906(CardRegistry& r) {
    r.registerCard(906, std::make_unique<KeeperOfLaw>());
}

} // namespace riftbound
