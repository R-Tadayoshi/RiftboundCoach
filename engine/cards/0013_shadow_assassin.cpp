#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Shadow Assassin (VEN-013/166)
///
///   I enter ready if you have a card with my name in your trash.
///
/// Matched by NAME, not by card id. A reprint of this card in another set has
/// a different def id and a different numeric id but the same printed name,
/// and the text says "a card with my name" — so the id is the wrong key.
/// (Card naming has bitten this project repeatedly in the other direction
/// too: a legend is printed with its champion tag and named without it.)
class ShadowAssassin : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    bool entersReadyOnPlay(const GameState& state, PlayerId controller) const override {
        for (auto id : state.player(controller).trash) {
            if (!state.objectExists(id)) continue;
            if (state.getObject(id).name == def_.name) return true;
        }
        return false;
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 800;
        d.def_id = R"RB(ven-013-166)RB";
        d.name = R"RB(Shadow Assassin)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-013/166)RB";
        d.collector_number = 13;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 5;
        d.might = 5;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(I enter ready if you have a card with my name in your trash.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-013-166-f41d7e96bc558e64.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_800(CardRegistry& r) {
    r.registerCard(800, std::make_unique<ShadowAssassin>());
}

} // namespace riftbound
