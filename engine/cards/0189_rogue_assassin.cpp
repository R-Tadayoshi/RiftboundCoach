#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Rogue Assassin (VEN-139/166)
///
///   [Empower] [3][A]
///   [Action][>] [E]: If it's your turn, move a friendly unit in a showdown
///   to base and if I'm [Empowered], ready it.
///
/// THE EMPOWER COST IS RAINBOW, so its power symbol is any rune, not one of
/// this legend's two domains. `Domain::Count` is how the engine already
/// spells that — `availableActivationPower` reads it as universal — so no
/// new cost shape was needed. Picking Calm or Fury instead would have made
/// the card strictly harder to empower than printed, which is the safe
/// direction and still the wrong price.
///
/// "IF IT'S YOUR TURN" is a condition on the EFFECT, not on activating: the
/// ability is [Action], so it is legal in a showdown on either turn, and
/// activating it on the opponent's turn exhausts this legend for nothing.
/// That is what the card says, so the gate lives in onActivate rather than
/// in canActivateAbility — declaring it unactivatable would be a legality
/// claim the rules do not make.
///
/// "AND IF I'M [EMPOWERED], READY IT" — the ready is the gated half; the
/// move is not. An un-Empowered Rogue Assassin still pulls a unit out of a
/// showdown, which is most of why you play it.
///
/// The latch is read when the ability RESOLVES, not when it was activated.
class RogueAssassin : public LegendCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        ActivatedAbility action;
        action.cost = {.exhaust = true};
        action.is_action = true;
        action.needs_activation_time_target = true;
        return {empowerAbility({.energy = 3, .power = 1,
                                .power_domain = Domain::Count}),
                action};
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, /*empower_index=*/0, {});
    }

    void onActivate(CardContext& ctx, int ability_index,
                    const std::vector<GameObjectId>& targets) override {
        if (ability_index == 0) { empowerObject(ctx, ctx.source); return; }
        if (ability_index != 1) return;

        if (ctx.state.turn.turn_player != ctx.controller) {
            ctx.events.logTrace("ROGUE ASSASSIN: not your turn -> exhausted for nothing");
            return;
        }

        auto legal = friendlyUnitsInShowdown(ctx.state, ctx.controller);
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else if (!legal.empty())
            picked = pickTarget(ctx, "Rogue Assassin: pull a friendly unit out of a showdown",
                                 legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        ctx.executor.moveToBase(picked);
        if (isEmpowered(ctx.state, ctx.source)) {
            ctx.executor.readyObject(picked);
            ctx.events.logTrace("ROGUE ASSASSIN: [Empowered] -> pulled " +
                                 ctx.state.getObject(picked).name + " to base and readied it");
            return;
        }
        ctx.events.logTrace("ROGUE ASSASSIN: pulled " +
                             ctx.state.getObject(picked).name + " to base");
    }

private:
    static std::vector<GameObjectId> friendlyUnitsInShowdown(const GameState& state,
                                                              PlayerId controller) {
        std::vector<GameObjectId> out;
        for (const auto& [id, obj] : state.objects) {
            if (!obj.isUnit()) continue;
            if (obj.controller != controller) continue;
            const auto bf = obj.battlefieldId();
            if (!bf) continue;
            for (const auto& b : state.battlefields) {
                if (b.id != *bf) continue;
                if (b.showdown_in_progress) out.push_back(id);
                break;
            }
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 976;
        d.def_id = R"RB(ven-189-166)RB";
        d.name = R"RB(Rogue Assassin)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-189/166)RB";
        d.collector_number = 189;
        d.card_type = CardType::Legend;
        d.domains = {Domain::Calm, Domain::Fury};
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Action);
        d.ability_text = R"RB([Empower] :rb_energy_3::rb_rune_rainbow:[Action][>] :rb_exhaust:: If it's your turn, move a friendly unit in a showdown to base and if I'm [Empowered], ready it.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-189-166-3a5af02c24d93aef.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_976(CardRegistry& r) {
    r.registerCard(976, std::make_unique<RogueAssassin>());
}

} // namespace riftbound
