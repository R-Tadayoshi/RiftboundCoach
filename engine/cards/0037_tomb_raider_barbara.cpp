#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Tomb-Raider Barbara (VEN-037/166)
///
///   When you play me, if you control 7 or more runes, choose an enemy gear.
///   If it's [Empowered], disempower it. Otherwise, kill it.
///
/// THE RUNE COUNT IS CHECKED, NOT ASSUMED. Seven runes is late-game, and a
/// Barbara played on turn four does nothing at all — so the check comes
/// first and, failing it, the card never publishes a choice. Offering the
/// target and then discarding the effect would put a decision in the trace
/// that could not have mattered.
///
/// runesControlled() counts runes ON THE BOARD, exhausted included: "control
/// 7 or more runes" asks how many you have, not how many you can spend.
///
/// [EMPOWERED] IS A SOFTER OUTCOME, and that is the point of the clause —
/// an Empowered gear survives, merely losing the latch. So the branch is
/// read at resolution, not at the time of choosing: if something empowers
/// the gear in between, it is disempowered rather than killed, which is what
/// the card says.
class TombRaiderBarbara : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenYouPlayMe; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        if (runesControlled(ctx.state, ctx.controller) < 7) {
            ctx.events.logTrace("TOMB-RAIDER BARBARA: fewer than 7 runes -> no effect");
            return;
        }

        auto legal = enemyGear(ctx.state, ctx.controller);
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else if (!legal.empty())
            picked = pickTarget(ctx, "Tomb-Raider Barbara: choose an enemy gear", legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        if (isEmpowered(ctx.state, picked)) {
            ctx.events.logTrace("TOMB-RAIDER BARBARA: " +
                                 ctx.state.getObject(picked).name +
                                 " is [Empowered] -> disempowered, not killed");
            disempowerObject(ctx, picked);
            return;
        }
        ctx.events.logTrace("TOMB-RAIDER BARBARA: killed " +
                             ctx.state.getObject(picked).name);
        ctx.executor.killObject(picked);
    }

private:
    static std::vector<GameObjectId> enemyGear(const GameState& state,
                                                PlayerId controller) {
        std::vector<GameObjectId> out;
        for (const auto& [id, obj] : state.objects) {
            if (obj.card_type != CardType::Gear) continue;
            if (obj.controller == controller) continue;
            if (!obj.location.has_value()) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 824;
        d.def_id = R"RB(ven-037-166)RB";
        d.name = R"RB(Tomb-Raider Barbara)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-037/166)RB";
        d.collector_number = 37;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 4;
        d.might = 4;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(When you play me, if you control 7 or more runes, choose an enemy gear. If it's [Empowered], disempower it. Otherwise, kill it.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-037-166-40d4fb29709d18b2.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_824(CardRegistry& r) {
    r.registerCard(824, std::make_unique<TombRaiderBarbara>());
}

} // namespace riftbound
