#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Noxian Demolitionist (VEN-080/166)
///
///   When I conquer, you may kill a gear with Energy cost no more than my
///   Might.
///
/// The threshold is MY MIGHT, read when the trigger resolves — not the
/// printed 1. A Demolitionist that has been buffed, or is standing under an
/// aura, eats a bigger gear, and that interaction is the reason to play a
/// 2-cost 1-Might body at all. Reading the CardDef's `might` instead would
/// cap it at 1 forever and quietly make the card unplayable.
///
/// Gear cost is read from the CardDB, not from the object: a gear's energy
/// cost is static card data, and the object carries no copy of it.
class NoxianDemolitionist : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenIConquer; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        const int reach = ctx.state.getObject(ctx.source).current_might;

        std::vector<GameObjectId> legal;
        for (auto& [id, obj] : ctx.state.objects) {
            if (!obj.isGear() || !obj.location.has_value()) continue;
            if (obj.controller != ctx.controller && obj.untargetable_by_enemy) continue;
            if (obj.card_def_id == kInvalidId) continue;
            if (ctx.executor.cardDB().get(obj.card_def_id).energy_cost > reach) continue;
            legal.push_back(id);
        }
        if (legal.empty()) {
            ctx.events.logTrace("NOXIAN DEMOLITIONIST: no gear at cost <= " +
                                 std::to_string(reach));
            return;
        }

        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else picked = pickTarget(ctx, "Noxian Demolitionist: kill a gear", legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        ctx.events.logTrace("NOXIAN DEMOLITIONIST: killed " +
                             ctx.state.getObject(picked).name);
        ctx.executor.killObject(picked);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 867;
        d.def_id = R"RB(ven-080-166)RB";
        d.name = R"RB(Noxian Demolitionist)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-080/166)RB";
        d.collector_number = 80;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Body};
        d.energy_cost = 2;
        d.might = 1;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(When I conquer, you may kill a gear with Energy cost no more than my Might.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-080-166-681101e92f2fb1f1.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_867(CardRegistry& r) {
    r.registerCard(867, std::make_unique<NoxianDemolitionist>());
}

} // namespace riftbound
