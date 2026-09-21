#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Alpha Wildclaw (UNL-057/219)
///
///   [Tank]
///   Your units here with less Might than me can't be chosen by enemy spells
///   and abilities.
///
/// The engine's own file for this card carried an ENGINE GAP note saying the
/// second line was inexpressible, and it was right about why:
/// untargetable_by_enemy is assigned per-object inside the same loop that
/// calls applyPassiveAura, so a card protecting OTHERS has its work erased
/// by whichever protected unit the loop reaches afterwards and kept by
/// whichever it has already passed. Order-dependent, silently, and different
/// whenever the object map rehashes.
///
/// Closed with a separate aura_untargetable_by_enemy field, cleared in the
/// aura pass's first step and folded in at the last, after every hook has
/// run. Third field on this one concept, and each exists for a different
/// lifetime: the card's own answer, a this-turn grant, and a continuous one.
///
/// "LESS Might than me" is strict, so an equal-sized unit is not protected,
/// and the protection moves by itself as Might changes. "Your units HERE" —
/// the Wildclaw's controller, at the Wildclaw's own battlefield; a Wildclaw
/// sitting in a base protects nothing. It never protects itself, which is
/// what [Tank] is for.
class AlphaWildclaw : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    void applyPassiveAura(GameState& state, PlayerId controller,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        const auto& me = state.getObject(self);
        const auto here = me.battlefieldId();
        if (!here) return;
        const int my_might = me.current_might;

        for (auto& [id, obj] : state.objects) {
            if (id == self) continue;
            if (!obj.isUnit() || obj.controller != controller) continue;
            auto bf = obj.battlefieldId();
            if (!bf || *bf != *here) continue;
            if (obj.current_might >= my_might) continue;   // strictly less
            obj.aura_untargetable_by_enemy = true;
        }
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 619;
        d.def_id = R"RB(unl-057-219)RB";
        d.name = R"RB(Alpha Wildclaw)RB";
        d.set_code = R"RB(UNL)RB";
        d.set_name = R"RB(Unleashed)RB";
        d.public_code = R"RB(UNL-057/219)RB";
        d.collector_number = 57;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.tags = {R"RB(Cat)RB", R"RB(Freljord)RB"};
        d.energy_cost = 6;
        d.power_cost = 2;
        d.might = 7;
        d.rarity = Rarity::Epic;
        d.keywords.set(Keyword::Tank);
        d.ability_text = R"RB([Tank] (I must be assigned combat damage first.)
Your units here with less Might than me can't be chosen by enemy spells and abilities.)RB";
        d.image_url = R"RB(https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/39ec974dae18bf82fcc18a95044d8df04cc14d3c-744x1039.png?accountingTag=RB)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_619(CardRegistry& r) {
    r.registerCard(619, std::make_unique<AlphaWildclaw>());
}

} // namespace riftbound
