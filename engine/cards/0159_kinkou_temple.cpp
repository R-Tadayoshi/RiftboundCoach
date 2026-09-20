#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Kinkou Temple (VEN-159/166)
///
///   Units here with [Tank] have +1 :rb_might:.
class KinkouTemple : public BattlefieldCard {
public:
    const CardDef& def() const override { return def_; }

    // "Units here with [Tank] have +1 [M]." An aura scoped to this
    // battlefield, so it is recomputed every pass rather than applied once —
    // a unit that gains or loses Tank, or moves in or out, must see the
    // bonus follow it.
    void applyPassiveAura(GameState& state, PlayerId /*controller*/) const override {
        for (auto& bf : state.battlefields) {
            if (!state.objectExists(bf.card_object_id)) continue;
            if (state.getObject(bf.card_object_id).card_def_id != def_.id) continue;

            for (auto& [id, obj] : state.objects) {
                if (!obj.isUnit() || !obj.location.has_value()) continue;
                const auto* at = std::get_if<BattlefieldLocation>(&*obj.location);
                if (!at || at->id != bf.id) continue;         // "here"
                if (!obj.keywords.has(Keyword::Tank)) continue;
                GameObject::AuraEffect ae;
                ae.source = bf.card_object_id;
                ae.might_bonus = 1;
                obj.aura_effects.push_back(ae);
            }
        }
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 946;
        d.def_id = R"RB(ven-159-166)RB";
        d.name = R"RB(Kinkou Temple)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-159/166)RB";
        d.collector_number = 159;
        d.card_type = CardType::Battlefield;
        d.rarity = Rarity::Uncommon;
        d.keywords.set(Keyword::Tank);
        d.ability_text = R"RB(Units here with [Tank] have +1 :rb_might:.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-159-166-a1d174e65d6e5014.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_946(CardRegistry& r) {
    r.registerCard(946, std::make_unique<KinkouTemple>());
}

} // namespace riftbound
