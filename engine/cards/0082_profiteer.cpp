#include "cards/card_helpers.h"

#include <algorithm>
#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Profiteer (VEN-082/166)
///
///   When you play me, you may disempower something you control to empower
///   a legend, unit, or gear.
///
/// A TRADE, NOT A GIFT: the disempower is the cost and the empower is what
/// it buys, so neither half happens without the other. pickTargetPair is
/// what makes that expressible — one prompt for what you give up, a second
/// narrowed by the first — and the pair only commits once both are in hand.
///
/// "SOMETHING YOU CONTROL" for the cost, and just "a legend, unit, or gear"
/// for the gain: no possessive on the second half, so an enemy's card is a
/// legal thing to empower. That reads like a mistake and is not always one —
/// Tomb-Raider Barbara DISEMPOWERS an Empowered enemy gear rather than
/// killing it, so empowering theirs can be how you save it from something
/// worse. Both sides are offered and the search decides.
///
/// Something already Empowered is not offered as the gain: empowerObject is
/// idempotent, so that pick would pay the cost and do nothing. The cost side
/// is the mirror — only something Empowered can be disempowered.
class Profiteer : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenYouPlayMe; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        const int yes = confirmOptional(
            ctx, "Profiteer: disempower something you control to empower something",
            [&ctx]() {
                return !empowerable(ctx.state).empty() &&
                       !toGiveUp(ctx.state, ctx.controller).empty();
            });
        if (yes <= 0) return;   // -1 yielded for agent input, 0 declined/illegal

        auto [cost, gain] = pickTargetPair(
            ctx, "Profiteer",
            toGiveUp(ctx.state, ctx.controller),
            [&ctx](GameObjectId given_up) {
                auto out = empowerable(ctx.state);
                // The thing you just disempowered is not a legal gain: it
                // would be a no-op trade that still spends the trigger.
                out.erase(std::remove(out.begin(), out.end(), given_up), out.end());
                return out;
            });
        if (cost == kInvalidId || gain == kInvalidId) return;   // suspended or none
        if (!ctx.state.objectExists(cost) || !ctx.state.objectExists(gain)) return;

        disempowerObject(ctx, cost);
        empowerObject(ctx, gain);
        ctx.events.logTrace("PROFITEER: traded " + ctx.state.getObject(cost).name +
                             "'s Empower for " + ctx.state.getObject(gain).name + "'s");
    }

private:
    /// On the board, and of a type the card names.
    ///
    /// A legend has no `location` — it sits in ZoneType::LegendZone — so the
    /// "is it on the board" test is the engine's own two-part one, the same
    /// shape the trigger manager and the aura sweep use. Testing only
    /// `location` would have quietly dropped every legend from a card that
    /// names legends first.
    static bool isTradeable(const GameObject& obj) {
        if (!obj.location.has_value() && obj.zone != ZoneType::LegendZone) return false;
        return obj.card_type == CardType::Unit ||
               obj.card_type == CardType::Gear ||
               obj.card_type == CardType::Legend;
    }

    /// What can be disempowered: yours, on the board, and Empowered now.
    static std::vector<GameObjectId> toGiveUp(const GameState& state,
                                               PlayerId controller) {
        std::vector<GameObjectId> out;
        for (const auto& [id, obj] : state.objects) {
            if (obj.controller != controller) continue;
            if (!isTradeable(obj)) continue;
            if (!obj.is_empowered) continue;
            out.push_back(id);
        }
        return out;
    }

    /// What can be empowered: a legend, unit or gear on the board, either
    /// player's, that is not Empowered already.
    static std::vector<GameObjectId> empowerable(const GameState& state) {
        std::vector<GameObjectId> out;
        for (const auto& [id, obj] : state.objects) {
            if (!isTradeable(obj)) continue;
            if (obj.is_empowered) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 869;
        d.def_id = R"RB(ven-082-166)RB";
        d.name = R"RB(Profiteer)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-082/166)RB";
        d.collector_number = 82;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Body};
        d.energy_cost = 4;
        d.might = 4;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(When you play me, you may disempower something you control to empower a legend, unit, or gear.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-082-166-b80dd42a8cdc418b.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_869(CardRegistry& r) {
    r.registerCard(869, std::make_unique<Profiteer>());
}

} // namespace riftbound
