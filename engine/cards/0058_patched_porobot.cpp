#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Patched Porobot (VEN-058/166)
///
///   (I enter exhausted.)
///   When you play me, if you control 3 or more other gear, draw 1.
///
/// "other" is the whole trick here: the count is of gear, and this is a unit,
/// so nothing this card does can be counted by mistake — but the clause is
/// worth reading twice rather than copying from a card where "other" excludes
/// itself from a same-type count.
///
/// The condition is checked when the trigger resolves, not when it is put on
/// the chain, which is when the count is what the player can see.
class PatchedPorobot : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenYouPlayMe; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        int gear = 0;
        for (auto& [id, obj] : ctx.state.objects) {
            if (id == ctx.source) continue;
            if (!obj.isGear()) continue;
            if (obj.controller != ctx.controller) continue;
            if (!obj.location.has_value()) continue;   // not on the board
            ++gear;
        }
        if (gear < 3) {
            ctx.events.logTrace("PATCHED POROBOT: only " + std::to_string(gear) +
                                 " other gear — no draw");
            return;
        }
        ctx.executor.drawCards(ctx.controller, 1);
        ctx.events.logTrace("PATCHED POROBOT: " + std::to_string(gear) +
                             " other gear -> draw 1");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 845;
        d.def_id = R"RB(ven-058-166)RB";
        d.name = R"RB(Patched Porobot)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-058/166)RB";
        d.collector_number = 58;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Mind};
        d.energy_cost = 2;
        d.might = 2;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB((I enter exhausted.)When you play me, if you control 3 or more other gear, draw 1.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-058-166-83b7edbd3de3c806.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_845(CardRegistry& r) {
    r.registerCard(845, std::make_unique<PatchedPorobot>());
}

} // namespace riftbound
