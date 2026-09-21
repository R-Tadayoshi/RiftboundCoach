#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Spiderling (VEN-097/166)
///
///   [Hidden]
///   I have +1 [M] for each OTHER unit you control here with my name.
///   Your deck can have any number of cards named Spiderling.
///
/// "EACH OTHER" — a lone Spiderling is a 1, two are 2s, three are 3s. The
/// count excludes the Spiderling being counted for, which is what makes the
/// growth quadratic in total Might and linear per body; counting itself
/// would make a single one a 2 and every board one point too strong.
///
/// "WITH MY NAME", not "with my card id". The deck-building clause exists
/// because this card is meant to come in a pile, and a reprint would be a
/// different id with the same name. Matched on name so a future printing
/// counts, which is the same rule that made variant printings bite the card
/// mapper three times.
///
/// "HERE" — the same location, base or battlefield. Two Spiderlings in
/// different places are both 1s.
///
/// The deck-building clause needs no code: nothing in the engine enforces a
/// copy limit, so "any number" is already true. Noted rather than silently
/// skipped.
class Spiderling : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    void applyPassiveAura(GameState& state, PlayerId controller,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        auto& me = state.getObject(self);
        if (!me.location.has_value()) return;

        int others = 0;
        for (const auto& [id, obj] : state.objects) {
            if (id == self) continue;
            if (obj.controller != controller) continue;
            if (!obj.isUnit()) continue;
            if (!obj.location.has_value()) continue;
            if (*obj.location != *me.location) continue;
            if (obj.name != me.name) continue;
            ++others;
        }
        if (others == 0) return;

        GameObject::AuraEffect ae;
        ae.source = self;
        ae.might_bonus = others;
        me.aura_effects.push_back(ae);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 884;
        d.def_id = R"RB(ven-097-166)RB";
        d.name = R"RB(Spiderling)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-097/166)RB";
        d.collector_number = 97;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Chaos};
        d.energy_cost = 3;
        d.might = 1;
        d.rarity = Rarity::Common;
        d.keywords.set(Keyword::Hidden);
        d.ability_text = R"RB([Hidden] (Hide now for :rb_rune_rainbow: to react with later for :rb_energy_0:.)I have +1 :rb_might: for each other unit you control here with my name.Your deck can have any number of cards named Spiderling.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-097-166-7b8bdb8249148b95.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_884(CardRegistry& r) {
    r.registerCard(884, std::make_unique<Spiderling>());
}

} // namespace riftbound
