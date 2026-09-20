#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"

#include <memory>

namespace riftbound {
namespace {

/// Repair Specialist (VEN-076)
///
///   I have [Assault] equal to the number of gear you control.
///
/// Granted through an aura rather than written into assault_value directly.
/// The count changes whenever gear enters or leaves, and aura effects are
/// cleared and rebuilt on every recalc — so the Assault tracks the board
/// instead of freezing at whatever was out when this resolved.
class RepairSpecialist : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    void applyPassiveAura(GameState& state, PlayerId controller) const override {
        int gear = 0;
        for (auto& [id, obj] : state.objects) {
            if (obj.controller != controller) continue;
            if (obj.card_type != CardType::Gear) continue;
            // Attached gear is still gear you control.
            if (!obj.location.has_value() && !obj.attached_to.has_value()) continue;
            ++gear;
        }
        if (gear <= 0) return;

        for (auto& [id, obj] : state.objects) {
            if (obj.card_def_id != def_.id) continue;
            if (obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
            GameObject::AuraEffect ae;
            ae.source = id;
            ae.keyword = Keyword::Assault;
            ae.keyword_value = gear;
            obj.aura_effects.push_back(ae);
        }
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 863;
        d.def_id = R"RB(ven-076-166)RB";
        d.name = R"RB(Repair Specialist)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-076/166)RB";
        d.collector_number = 76;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Body};
        d.energy_cost = 3;
        d.might = 3;
        d.rarity = Rarity::Common;
        d.keywords.set(Keyword::Assault);
        d.assault_value = 1;
        d.ability_text = R"RB(I have [Assault] equal to the number of gear you control. (+1 :rb_might: while I'm an attacker for each instance of Assault.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-076-166-d7deb0952e8e7577.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_863(CardRegistry& r) {
    r.registerCard(863, std::make_unique<RepairSpecialist>());
}

} // namespace riftbound
