#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Disciple of Shen (VEN-117/166)
///
///   [Hidden]
///   I have [Shield 3] while I'm at a battlefield with exactly one other
///   unit you control.
///
/// [Shield 3] IS CONDITIONAL, so it does not belong on the CardDef — the
/// generator put it there because the keyword is printed outright, and the
/// condition that follows is prose the regex cannot see. That is the third
/// generator shape recorded in docs/alpharune-integration.md ("behind
/// another condition"), and it is hand-corrected here: the CardDef keeps
/// [Hidden] and drops the Shield, which the aura grants when the board
/// earns it.
///
/// "EXACTLY ONE OTHER" — not "at least one". A third friendly unit turns the
/// Shield OFF, which is the whole texture of the card: it wants a pair, and
/// reinforcing the battlefield costs it 3 Might on defence.
///
/// "AT A BATTLEFIELD" excludes the base, where nothing defends anyway.
/// "YOU CONTROL" counts the controller's units only; an enemy unit standing
/// at the same battlefield is not one of the pair.
class DiscipleOfShen : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    void applyPassiveAura(GameState& state, PlayerId controller,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        auto& me = state.getObject(self);
        if (!me.location.has_value()) return;
        if (!std::holds_alternative<BattlefieldLocation>(*me.location)) return;

        int others = 0;
        for (const auto& [id, obj] : state.objects) {
            if (id == self) continue;
            if (obj.controller != controller) continue;
            if (!obj.isUnit()) continue;
            if (!obj.location.has_value()) continue;
            if (*obj.location != *me.location) continue;
            ++others;
            if (others > 1) return;   // "exactly one" — a third turns it off
        }
        if (others != 1) return;

        GameObject::AuraEffect ae;
        ae.source = self;
        ae.keyword = Keyword::Shield;
        ae.keyword_value = 3;
        me.aura_effects.push_back(ae);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 904;
        d.def_id = R"RB(ven-117-166)RB";
        d.name = R"RB(Disciple of Shen)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-117/166)RB";
        d.collector_number = 117;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Order};
        d.energy_cost = 2;
        d.might = 1;
        d.rarity = Rarity::Common;
        d.keywords.set(Keyword::Hidden);
        d.ability_text = R"RB([Hidden] (Hide now for :rb_rune_rainbow: to react with later for :rb_energy_0:.)I have [Shield 3] while I'm at a battlefield with exactly one other unit you control. (+3 :rb_might: while I'm a defender.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-117-166-54db5b4a916a7d02.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_904(CardRegistry& r) {
    r.registerCard(904, std::make_unique<DiscipleOfShen>());
}

} // namespace riftbound
