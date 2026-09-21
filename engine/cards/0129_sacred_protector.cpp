#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Sacred Protector (VEN-129/166)
///
///   I don't deal combat damage unless I'm at a battlefield with exactly one
///   other unit you control.
///
/// A 6-Might body for [4][Order] that is a wall by default and a fighter in
/// exactly one formation. The condition is narrow in BOTH directions —
/// exactly one other friendly unit here, so alone it deals nothing and in a
/// crowd it deals nothing either — which is the opposite of how most "while
/// you control N" clauses read, and easy to write as "at least one".
///
/// Expressed as a self-aura rather than a keyword because it is continuous
/// and depends on the board: units arriving and leaving switch it on and off
/// with no event, and every recalculateAuras re-derives it from scratch.
///
/// Note the direction: the aura is set when the condition FAILS. The field
/// is aura_no_combat_damage, so the default (no aura) is a unit that fights.
class SacredProtector : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    void applyPassiveAura(GameState& state, PlayerId controller,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        auto& me = state.getObject(self);
        if (!me.location.has_value()) return;

        int others = 0;
        const auto here = me.battlefieldId();
        if (here) {
            for (auto& [id, obj] : state.objects) {
                if (id == self) continue;
                if (!obj.isUnit() || obj.controller != controller) continue;
                auto bf = obj.battlefieldId();
                if (!bf || *bf != *here) continue;
                ++others;
            }
        }
        // No battlefield at all (sitting in a base) also fails the condition.
        if (!here || others != 1) {
            GameObject::AuraEffect ae;
            ae.source = self;
            ae.suppress_combat_damage = true;
            me.aura_effects.push_back(ae);
        }
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 916;
        d.def_id = R"RB(ven-129-166)RB";
        d.name = R"RB(Sacred Protector)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-129/166)RB";
        d.collector_number = 129;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Order};
        d.energy_cost = 4;
        d.power_cost = 1;
        d.might = 6;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(I don't deal combat damage unless I'm at a battlefield with exactly one other unit you control.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-129-166-22c60733f185eaf7.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_916(CardRegistry& r) {
    r.registerCard(916, std::make_unique<SacredProtector>());
}

} // namespace riftbound
