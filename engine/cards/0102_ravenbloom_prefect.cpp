#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Ravenbloom Prefect (VEN-102/166)
///
///   When an opponent plays a gear, you may banish me to banish it.
///
/// A trade the opponent cannot play around once it is on the board, which is
/// why it is worth a 3-cost 3-Might body. Both halves are banishes, not
/// kills: neither card reaches a trash, so neither comes back through Flow,
/// a Deathknell, or anything that reads a trash.
///
/// The played gear arrives via card_counters, not targets — triggers receive
/// empty targets, so the trigger manager captures the id the same way
/// WhenOpponentPlaysAUnit does for Vex, Apathetic. Reading `targets` here
/// would compile and the Prefect would never banish anything.
///
/// Banishing itself is the cost and happens first. If the gear has already
/// left (countered, or banished by something else in response) the Prefect
/// is still gone — which is what "banish me to banish it" costs.
class RavenbloomPrefect : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override {
        return TriggerType::WhenOpponentPlaysAGear;
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        auto& self = ctx.state.getObject(ctx.source);
        auto it = self.card_counters.find("__opp_played_gear_id");
        if (it == self.card_counters.end()) return;
        const auto gear = static_cast<GameObjectId>(it->second);
        if (gear == kInvalidId || !ctx.state.objectExists(gear)) return;

        ctx.events.logTrace("RAVENBLOOM PREFECT: banished itself to banish " +
                             ctx.state.getObject(gear).name);
        ctx.executor.banishObject(ctx.source);
        ctx.executor.banishObject(gear);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 889;
        d.def_id = R"RB(ven-102-166)RB";
        d.name = R"RB(Ravenbloom Prefect)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-102/166)RB";
        d.collector_number = 102;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Chaos};
        d.energy_cost = 3;
        d.might = 3;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(When an opponent plays a gear, you may banish me to banish it.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-102-166-d8a4132e8ca348ba.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_889(CardRegistry& r) {
    r.registerCard(889, std::make_unique<RavenbloomPrefect>());
}

} // namespace riftbound
