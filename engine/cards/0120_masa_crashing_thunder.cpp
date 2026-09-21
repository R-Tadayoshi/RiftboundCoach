#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Masa, Crashing Thunder (VEN-120/166)
///
///   You may pay [Order] as an additional cost to play me.
///   When you play me, if you paid the additional cost, [Stun] an enemy unit
///   at a battlefield.
///
/// The cheapest of the "pay extra for a rider" cards to get right, because
/// [Stun] is already an engine mechanic (stunUnit, UnitStunnedEvent) — the
/// only work is the optional cost and reading back whether it was paid.
///
/// "At a battlefield" excludes units sitting in a base, which is the whole
/// restriction: Masa answers something already committed to a fight, not
/// anything on the board. With no enemy at a battlefield the rider finds
/// nothing and the [Order] is wasted, which is why the payment is a
/// decision rather than a formality.
class MasaCrashingThunder : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    OptionalAdditionalCost optionalAdditionalCost() const override {
        OptionalAdditionalCost c;
        c.valid = true;
        c.power = 1;
        c.power_domain = Domain::Order;
        c.paid_flag = "masa_paid";
        return c;
    }

    TriggerType triggerType() const override { return TriggerType::WhenYouPlayMe; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        auto& self = ctx.state.getObject(ctx.source);
        auto it = self.card_counters.find("masa_paid");
        if (it == self.card_counters.end() || it->second == 0) return;

        auto legal = enemiesAtBattlefields(ctx.state, ctx.controller);
        if (legal.empty()) {
            ctx.events.logTrace("MASA, CRASHING THUNDER: no enemy unit at a battlefield");
            return;
        }
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else picked = pickTarget(ctx, "Masa, Crashing Thunder: stun an enemy unit", legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        ctx.executor.stunUnit(picked);
        ctx.events.logTrace("MASA, CRASHING THUNDER: stunned " +
                             ctx.state.getObject(picked).name);
    }

private:
    static std::vector<GameObjectId> enemiesAtBattlefields(const GameState& state,
                                                           PlayerId controller) {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || obj.controller == controller) continue;
            if (!obj.isAtBattlefield()) continue;
            if (obj.untargetable_by_enemy) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 907;
        d.def_id = R"RB(ven-120-166)RB";
        d.name = R"RB(Masa, Crashing Thunder)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-120/166)RB";
        d.collector_number = 120;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Order};
        d.energy_cost = 4;
        d.might = 4;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(You may pay :rb_rune_order: as an additional cost to play me.When you play me, if you paid the additional cost, [Stun] an enemy unit at a battlefield. (It doesn't deal combat damage this turn.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-120-166-ed113b63ab0831ba.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_907(CardRegistry& r) {
    r.registerCard(907, std::make_unique<MasaCrashingThunder>());
}

} // namespace riftbound
