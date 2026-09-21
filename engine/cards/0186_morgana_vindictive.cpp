#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Morgana, Vindictive (VEN-017/166)
///
///   [Ambush]
///   When you play me, deal damage to a unit equal to the damage marked on
///   it.
///
/// A finisher, not removal: she doubles damage already there, so she does
/// nothing at all to an undamaged board. [Ambush] is what makes that
/// workable — she can arrive as a Reaction mid-combat, after damage has been
/// marked, which is the only moment the ability is worth anything.
///
/// So a unit with no damage marked is not a legal target. Offering one would
/// be offering a play that provably does nothing, and on an undamaged board
/// the trigger simply finds nothing.
class MorganaVindictive : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenYouPlayMe; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        auto legal = damaged(ctx.state, ctx.controller);
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else if (!legal.empty())
            picked = pickTarget(ctx, "Morgana, Vindictive: double a unit's damage", legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        // Read the marked damage at resolution and deal that much. Not
        // "double the damage": if something heals in between, the card deals
        // what is marked THEN, which is what it says.
        const int marked = ctx.state.getObject(picked).damage_marked;
        if (marked <= 0) return;
        ctx.executor.dealDamage(picked, marked, ctx.source);
        ctx.events.logTrace("MORGANA, VINDICTIVE: dealt " + std::to_string(marked) +
                             " to " + ctx.state.getObject(picked).name);
        if (ctx.state.objectExists(picked) &&
            ctx.state.getObject(picked).hasLethalDamage()) {
            ctx.executor.killObject(picked);
        }
    }

private:
    static std::vector<GameObjectId> damaged(const GameState& state, PlayerId controller) {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || !obj.location.has_value()) continue;
            if (obj.damage_marked <= 0) continue;
            if (obj.controller != controller && obj.untargetable_by_enemy) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 973;
        d.def_id = R"RB(ven-186-166)RB";
        d.name = R"RB(Morgana, Vindictive)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-186/166)RB";
        d.collector_number = 186;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 5;
        d.power_cost = 1;
        d.might = 5;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Ambush);
        d.ability_text = R"RB([Ambush]When you play me, deal damage to a unit equal to the damage marked on it.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-186-166-5a9614780541b5b6.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_973(CardRegistry& r) {
    r.registerCard(973, std::make_unique<MorganaVindictive>());
}

} // namespace riftbound
