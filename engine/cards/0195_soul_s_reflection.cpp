#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Soul's Reflection (VEN-151/166)
///
///   When you empower something else, empower me.
///   Disempower me, [E]: Give a unit at a battlefield -2 [M] this turn.
///
/// Matriarch of War's trigger with a removal-shaped payoff rather than a
/// tempo one. "-2 Might this turn" can finish a unit that is already damaged
/// or simply lose a combat for the other player, so the target is either
/// side's: shrinking your own is almost never right and is legal, and the
/// search can work that out.
///
/// "at a battlefield" excludes units sitting in a base, which is most of the
/// board on most turns — the card is a combat trick, not open removal.
class SoulSReflection : public LegendCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override {
        return TriggerType::WhenYouEmpowerSomethingElse;
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        empowerObject(ctx, ctx.source);
    }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {ActivatedAbility{
            .cost = {.exhaust = true},
            .targets = TargetRequirements{.count = 1, .must_be_unit = true,
                                           .must_be_at_battlefield = true},
            .needs_activation_time_target = true,
        }};
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, /*empower_index=*/-1,
                           /*requires_empowered=*/{0});
    }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller,
                                                    int /*ability_index*/) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || !obj.isAtBattlefield()) continue;
            if (obj.controller != controller && obj.untargetable_by_enemy) continue;
            out.push_back(id);
        }
        return out;
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller, 0).empty();
    }

    void onActivate(CardContext& ctx, int /*ability_index*/,
                    const std::vector<GameObjectId>& targets) override {
        disempowerObject(ctx, ctx.source);
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else picked = pickTarget(ctx, "Soul's Reflection: -2[M] this turn",
                                 enumerateLegalTargets(ctx.state, ctx.controller, 0));
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        // Minimum 0: Might never goes negative (recomputeMight clamps, but
        // say it here too rather than relying on the clamp).
        ctx.executor.giveTemporaryMight(picked, -2, /*minimum=*/0);
        ctx.events.logTrace("SOUL'S REFLECTION: -2[M] this turn -> " +
                             ctx.state.getObject(picked).name);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 982;
        d.def_id = R"RB(ven-195-166)RB";
        d.name = R"RB(Soul's Reflection)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-195/166)RB";
        d.collector_number = 195;
        d.card_type = CardType::Legend;
        d.domains = {Domain::Chaos, Domain::Mind};
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB(When you empower something else, empower me.Disempower me, :rb_exhaust:: Give a unit at a battlefield -2 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-195-166-7613e0ccccf6d9e8.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_982(CardRegistry& r) {
    r.registerCard(982, std::make_unique<SoulSReflection>());
}

} // namespace riftbound
