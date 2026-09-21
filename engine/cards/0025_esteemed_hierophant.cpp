#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Esteemed Hierophant (VEN-025/166)
///
///   While you control 7 or more runes, prevent all damage that enemy
///   spells and abilities would deal to me.
///
/// SPELLS AND ABILITIES, not all damage. The obvious implementation is
/// immune_to_damage, which also blocks combat damage — and a Hierophant that
/// cannot be killed in a fight is a much better card than this one. The
/// difference never surfaces as an error; it surfaces as a unit that keeps
/// winning combats it should lose. So this sets a separate per-object flag
/// that only the spell/ability path reads.
///
/// "ENEMY spells and abilities" is not filtered here: the engine's damage
/// path does not carry whose effect is dealing it in a form this hook can
/// see, and the only cost of the looser reading is that the Hierophant's own
/// controller cannot damage it with a spell either — which nobody is trying
/// to do. Noted rather than silently assumed.
///
/// Seven runes is late-game, so the protection arrives around the turn
/// removal starts mattering, and lifts by itself if the count drops.
class EsteemedHierophant : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    void applyPassiveAura(GameState& state, PlayerId controller,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        auto& obj = state.getObject(self);
        if (!obj.location.has_value()) return;
        if (runesControlled(state, controller) < 7) return;
        obj.immune_to_spell_ability_damage = true;
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 812;
        d.def_id = R"RB(ven-025-166)RB";
        d.name = R"RB(Esteemed Hierophant)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-025/166)RB";
        d.collector_number = 25;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 5;
        d.might = 5;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(While you control 7 or more runes, prevent all damage that enemy spells and abilities would deal to me.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-025-166-2d599ea726aa77e3.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_812(CardRegistry& r) {
    r.registerCard(812, std::make_unique<EsteemedHierophant>());
}

} // namespace riftbound
