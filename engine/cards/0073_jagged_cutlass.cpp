#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "cards/gear/equip_base.h"

#include <memory>

namespace riftbound {
namespace {

/// Jagged Cutlass (VEN-073)
///
///   Equip [Body] (Body: Attach this to a unit you control.)
///
/// The whole card is the Equip keyword and a might bonus on the CardDef, so
/// SimpleEquipGear carries all of it — no behaviour of its own to write.
class JaggedCutlass : public SimpleEquipGear {
public:
    JaggedCutlass() : SimpleEquipGear(Domain::Body) {}
    const CardDef& def() const override { return def_; }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 860;
        d.def_id = R"RB(ven-073-166)RB";
        d.name = R"RB(Jagged Cutlass)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-073/166)RB";
        d.collector_number = 73;
        d.card_type = CardType::Gear;
        d.domains = {Domain::Body};
        d.energy_cost = 3;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(Equip :rb_rune_body: (:rb_rune_body:: Attach this to a unit you control.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-073-166-7e1176cb08f33fd3.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_860(CardRegistry& r) {
    r.registerCard(860, std::make_unique<JaggedCutlass>());
}

} // namespace riftbound
