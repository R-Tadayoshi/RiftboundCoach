#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"
#include <algorithm>
#include <memory>
#include <string>
#include <vector>
#include "cards/card_helpers.h"

namespace riftbound {
namespace {

class RengarTrophyHunter : public UnitCard {
public:
    const CardDef& def() const override { return def_; }
    // Base "[Ambush]" is engine-handled.
    // "I can [Ambush] to a battlefield where there are enemy units, even if you
    // don't have units there." Wired via ambushToEnemyBattlefields(): the
    // engine's two Ambush action generators relax the "you have units here"
    // gate to also allow enemy-occupied BFs for this card.
    bool ambushToEnemyBattlefields() const override { return true; }
private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 966;
        d.def_id = R"RB(ven-179-166)RB";
        d.name = R"RB(Rengar, Trophy Hunter)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-179/166)RB";
        d.collector_number = 179;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Body};
        d.energy_cost = 5;
        d.power_cost = 1;
        d.might = 6;
        d.rarity = Rarity::Epic;
        d.keywords.set(Keyword::Ambush);
        d.ability_text = R"RB([Ambush]I can be played to a battlefield where there are enemy units.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-179-166-b61ec10b0ecbc6b2.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_966(CardRegistry& r) {
    r.registerCard(966, std::make_unique<RengarTrophyHunter>());
}

} // namespace riftbound
