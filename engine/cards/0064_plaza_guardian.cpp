#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Plaza Guardian (VEN-064/166)
///
///   I cost :rb_energy_1: less for each gear you control.[Deflect] (Opponents must pay :rb_rune_rainbow: to choose me with a spell or ability.)
class PlazaGuardian : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    // "I cost [1] less for each gear you control." selfCostReduction is the
    // hook for a card discounting itself; CostModifier is for discounting
    // OTHER cards and would be the wrong instrument here.
    //
    // Gear I control, wherever it sits on the board — attached gear is still
    // gear I control, so attachment is not a disqualifier.
    int selfCostReduction(const GameState& state, PlayerId player) const override {
        int gear = 0;
        for (auto& [id, obj] : state.objects) {
            if (obj.controller != player) continue;
            if (obj.card_type != CardType::Gear) continue;
            if (!obj.location.has_value() && !obj.attached_to.has_value()) continue;
            ++gear;
        }
        return gear;
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 851;
        d.def_id = R"RB(ven-064-166)RB";
        d.name = R"RB(Plaza Guardian)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-064/166)RB";
        d.collector_number = 64;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Mind};
        d.energy_cost = 10;
        d.might = 8;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Deflect);
        d.deflect_value = 1;
        d.ability_text = R"RB(I cost :rb_energy_1: less for each gear you control.[Deflect] (Opponents must pay :rb_rune_rainbow: to choose me with a spell or ability.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-064-166-e24176ee8801943e.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_851(CardRegistry& r) {
    r.registerCard(851, std::make_unique<PlazaGuardian>());
}

} // namespace riftbound
