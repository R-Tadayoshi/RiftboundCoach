#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Shadowblade Lurker (VEN-096/166)
///
///   I cost :rb_energy_2: less for each card with my name in your trash.
class ShadowbladeLurker : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    // "I cost [2] less for each card with my name in your trash."
    // Cards in the trash, matched by NAME rather than def id, so a reprint of
    // the same card counts — which is what the card says.
    int selfCostReduction(const GameState& state, PlayerId player) const override {
        int copies = 0;
        for (auto id : state.player(player).trash) {
            if (!state.objectExists(id)) continue;
            if (state.getObject(id).name == def_.name) ++copies;
        }
        return copies * 2;
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 883;
        d.def_id = R"RB(ven-096-166)RB";
        d.name = R"RB(Shadowblade Lurker)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-096/166)RB";
        d.collector_number = 96;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Chaos};
        d.energy_cost = 5;
        d.might = 5;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(I cost :rb_energy_2: less for each card with my name in your trash.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-096-166-a23e0265f04e1890.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_883(CardRegistry& r) {
    r.registerCard(883, std::make_unique<ShadowbladeLurker>());
}

} // namespace riftbound
