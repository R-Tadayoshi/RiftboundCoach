#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Dune Surfer (VEN-004/166)
///
///   You ignore [Tank] while assigning combat damage here.
///
/// The generated stub gave it Keyword::Tank — the generator saw "[Tank]" in
/// the printed text and granted it. The card says the OPPOSITE: it lets its
/// controller ignore Tank, and giving a 3-cost 3-Might body Tank itself
/// makes it a blocker it was never meant to be. Third shape of this same
/// artifact, after the [Empowered] gate and Oasis Raider's conditional
/// [Ganking], and the first where the generator inverted the meaning rather
/// than dropping a condition.
///
/// "YOU ignore" and "HERE": the Surfer's controller, at the Surfer's own
/// battlefield. The opponent still has to respect Tank there, and Tank
/// elsewhere is untouched. Ignoring does not make a Tank unit illegal to
/// hit — it stops that unit having to be dealt with first.
class DuneSurfer : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    void applyPassiveAura(GameState& state, PlayerId controller,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        const auto bf = state.getObject(self).battlefieldId();
        if (!bf) return;
        state.player(controller).ignores_tank_at.insert(*bf);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 791;
        d.def_id = R"RB(ven-004-166)RB";
        d.name = R"RB(Dune Surfer)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-004/166)RB";
        d.collector_number = 4;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 3;
        d.might = 3;
        d.rarity = Rarity::Common;
        // NOT keywords.set(Tank) — the card IGNORES Tank, it does not have it.
        d.ability_text = R"RB(You ignore [Tank] while assigning combat damage here.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-004-166-ac80379372e24976.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_791(CardRegistry& r) {
    r.registerCard(791, std::make_unique<DuneSurfer>());
}

} // namespace riftbound
