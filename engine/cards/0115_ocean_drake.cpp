#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Ocean Drake (VEN-115/166)
///
///   You may play me to an open battlefield.
///   When you play me, you may return a non-Dragon unit to its owner's hand.
///
/// Only the second line needs code. The first is engine-handled: the action
/// generator matches the substring "play me to an open battlefield" in
/// ability_text and emits the extra play intents itself, so overriding
/// getPlayLocations here would do nothing — it is never consulted on that
/// path. Worth saying, because the override looks like the obvious place.
///
/// "non-Dragon" is a tag check, and it protects Ocean Drake from itself and
/// from every other Dragon on the board — a Dragon deck bouncing its own
/// eight-drop is precisely what the clause exists to prevent.
class OceanDrake : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenYouPlayMe; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        auto legal = nonDragons(ctx.state, ctx.controller, ctx.source);
        if (legal.empty()) {
            ctx.events.logTrace("OCEAN DRAKE: no non-Dragon unit to return");
            return;
        }
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else picked = pickTarget(ctx, "Ocean Drake: return a non-Dragon unit", legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        ctx.events.logTrace("OCEAN DRAKE: returned " +
                             ctx.state.getObject(picked).name + " to hand");
        ctx.executor.bounceToHand(picked);
    }

private:
    static std::vector<GameObjectId> nonDragons(const GameState& state,
                                                PlayerId controller,
                                                GameObjectId self) {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (id == self) continue;
            if (!obj.isUnit() || !obj.location.has_value()) continue;
            if (obj.controller != controller && obj.untargetable_by_enemy) continue;
            bool dragon = false;
            for (const auto& tag : obj.tags) if (tag == "Dragon") { dragon = true; break; }
            if (dragon) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 902;
        d.def_id = R"RB(ven-115-166)RB";
        d.name = R"RB(Ocean Drake)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-115/166)RB";
        d.collector_number = 115;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Chaos};
        d.energy_cost = 8;
        d.power_cost = 2;
        d.might = 7;
        d.rarity = Rarity::Epic;
        d.ability_text = R"RB(You may play me to an open battlefield.When you play me, you may return a non-Dragon unit to its owner's hand.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-115-166-47b2c3977fce7b6c.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_902(CardRegistry& r) {
    r.registerCard(902, std::make_unique<OceanDrake>());
}

} // namespace riftbound
