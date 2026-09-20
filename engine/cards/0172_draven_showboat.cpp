#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Draven, Showboat (VEN-172/166)
///
///   My Might is increased by your points.
class DravenShowboat : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    // "My Might is increased by your points." A continuous self-buff that
    // tracks the score, so it is recomputed with the auras rather than
    // applied once — a score that goes up mid-turn must move the Might with
    // it, and a score that somehow goes down must move it back.
    void applyPassiveAura(GameState& state, PlayerId controller) const override {
        for (auto& [id, obj] : state.objects) {
            if (obj.card_def_id != def_.id) continue;
            if (obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
            obj.current_might += state.player(controller).score;
        }
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 959;
        d.def_id = R"RB(ven-172-166)RB";
        d.name = R"RB(Draven, Showboat)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-172/166)RB";
        d.collector_number = 172;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 5;
        d.power_cost = 1;
        d.might = 3;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB(My Might is increased by your points.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-172-166-81846bb0f605a41e.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_959(CardRegistry& r) {
    r.registerCard(959, std::make_unique<DravenShowboat>());
}

} // namespace riftbound
