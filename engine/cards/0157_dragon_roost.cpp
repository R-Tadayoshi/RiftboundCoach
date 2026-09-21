#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Dragon Roost (VEN-157/166)
///
///   Any player may pay [A][A] as an additional cost to play a Dragon. If
///   they do, they play it to this battlefield.
///
/// This is the card that needed Card::grantedPlayOption. Every other
/// additional cost in the engine belongs to the card being played, and the
/// engine asks that card; this one belongs to a card sitting on the board and
/// applies to something in someone's hand — including an opponent's hand,
/// since "any player" means what it says. A battlefield is not friendly to
/// anybody.
///
/// The second sentence is the reason it is a real decision rather than a
/// price: paying puts the Dragon HERE, which may be the wrong battlefield. A
/// search that treated it as a discount on an unchanged play would get the
/// card exactly backwards.
class DragonRoost : public BattlefieldCard {
public:
    const CardDef& def() const override { return def_; }

    GrantedPlayOption grantedPlayOption(const GameState& state, PlayerId /*player*/,
                                        GameObjectId card_being_played,
                                        GameObjectId /*self*/) const override {
        if (!state.objectExists(card_being_played)) return {};
        const auto& card = state.getObject(card_being_played);
        // "a Dragon" is the tag, not the name: Elder Dragon carries
        // {"Dragon", "Demacia"}, and the offer is about the tag.
        bool dragon = false;
        for (const auto& tag : card.tags) if (tag == "Dragon") { dragon = true; break; }
        if (!dragon) return {};

        GrantedPlayOption g;
        g.cost.valid = true;
        g.cost.power = 2;
        g.cost.any_domain = true;     // [A][A]
        g.play_to_granting_battlefield = true;
        return g;
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 944;
        d.def_id = R"RB(ven-157-166)RB";
        d.name = R"RB(Dragon Roost)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-157/166)RB";
        d.collector_number = 157;
        d.card_type = CardType::Battlefield;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(Any player may pay :rb_rune_rainbow::rb_rune_rainbow: as an additional cost to play a Dragon. If they do, they play it to this battlefield.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-157-166-cd476a9c59f40350.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_944(CardRegistry& r) {
    r.registerCard(944, std::make_unique<DragonRoost>());
}

} // namespace riftbound
