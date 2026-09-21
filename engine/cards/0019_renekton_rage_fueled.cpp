#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Renekton, Rage Fueled (VEN-019/166)
///
///   [Accelerate]
///   When I attack, if you control 4 or fewer runes, deal 2 to all enemy
///   units here.
///
/// [Accelerate] is engine-handled — it is a keyword on the CardDef and the
/// play path offers the additional cost — so only the attack trigger needs
/// writing. The two halves are the same plan, though: Accelerate lets a
/// 6-cost body attack the turn it lands, and the rune clause pays out
/// exactly while you are still on few enough runes for that to be early.
///
/// "4 or fewer" counts runes on the board you control, exhausted included:
/// the clause asks how many you have, not how many you can spend. Checked
/// when the trigger resolves, not when it goes on the chain.
///
/// "All enemy units HERE" — no target is chosen, so nothing is published and
/// nothing can fizzle for want of a legal target; an empty battlefield just
/// means nothing is damaged.
class RenektonRageFueled : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenIAttack; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        if (runesControlled(ctx.state, ctx.controller) > 4) {
            ctx.events.logTrace("RENEKTON, RAGE FUELED: more than 4 runes — no damage");
            return;
        }
        const auto here = ctx.state.getObject(ctx.source).battlefieldId();
        if (!here) return;

        std::vector<GameObjectId> victims;
        for (auto& [id, obj] : ctx.state.objects) {
            if (!obj.isUnit() || obj.controller == ctx.controller) continue;
            auto bf = obj.battlefieldId();
            if (!bf || *bf != *here) continue;
            victims.push_back(id);
        }
        for (auto id : victims) {
            ctx.executor.dealDamage(id, 2, ctx.source);
            if (ctx.state.objectExists(id) &&
                ctx.state.getObject(id).hasLethalDamage()) {
                ctx.executor.killObject(id);
            }
        }
        ctx.events.logTrace("RENEKTON, RAGE FUELED: dealt 2 to " +
                             std::to_string(victims.size()) + " enemy unit(s) here");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 806;
        d.def_id = R"RB(ven-019-166)RB";
        d.name = R"RB(Renekton, Rage Fueled)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-019/166)RB";
        d.collector_number = 19;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Fury};
        d.energy_cost = 6;
        d.might = 6;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Accelerate);
        d.ability_text = R"RB([Accelerate] (You may pay :rb_energy_1::rb_rune_fury: as an additional cost to have me enter ready.)When I attack, if you control 4 or fewer runes, deal 2 to all enemy units here.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-019-166-c8715fa4e30a349c.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_806(CardRegistry& r) {
    r.registerCard(806, std::make_unique<RenektonRageFueled>());
}

} // namespace riftbound
