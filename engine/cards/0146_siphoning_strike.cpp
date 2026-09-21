#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Siphoning Strike (VEN-146/166)
///
///   Deal 4 to a unit at a battlefield. If you control 7 or more runes, deal
///   7 to it instead. When it dies this turn, channel 1 rune exhausted.
///
/// The death-watch is armed BEFORE the damage, which is the whole trick: if
/// the 4 (or 7) is lethal, the unit dies inside dealDamage, and a watch
/// registered afterwards would be registered on something already dead.
/// Deadly Flourish learned this first; the ordering is copied deliberately.
///
/// And the watch is "when IT dies this turn", not "when it dies to this
/// spell" — a unit that survives the damage and dies to combat later the
/// same turn still pays. target_filter scopes it to that one object;
/// expiry handles "this turn".
///
/// "7 or more runes" is read at resolution, and 7 INSTEAD of 4. The rune
/// clause is what makes this an Epic: on a full board it kills almost
/// anything, and early it is an overpriced Shock.
class SiphoningStrike : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    bool needsPlayTimeTarget() const override { return true; }

    TargetRequirements getTargetRequirements() const override {
        return {.count = 1, .must_be_unit = true, .must_be_at_battlefield = true};
    }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || !obj.isAtBattlefield()) continue;
            if (obj.controller != controller && obj.untargetable_by_enemy) continue;
            out.push_back(id);
        }
        return out;
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller).empty();
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        GameObjectId victim = kInvalidId;
        if (!targets.empty()) victim = targets[0];
        else victim = pickTarget(ctx, "Siphoning Strike: a unit at a battlefield",
                                 enumerateLegalTargets(ctx.state, ctx.controller));
        if (victim == kInvalidId || !ctx.state.objectExists(victim)) return;

        // Armed first: lethal damage kills inside dealDamage, and a watch
        // registered after that would arrive too late to fire.
        DelayedAbility da;
        da.source = ctx.source;
        da.card_def_id = cardDefId();
        da.controller = ctx.controller;
        da.trigger = TriggerType::WhenIDie;
        da.target_filter = victim;
        ctx.state.delayed_abilities.push_back(da);

        const int amount = runesControlled(ctx.state, ctx.controller) >= 7 ? 7 : 4;
        ctx.executor.dealDamage(victim, amount, ctx.source);
        ctx.events.logTrace("SIPHONING STRIKE: dealt " + std::to_string(amount) +
                             ", death-watch armed");
    }

    /// The delayed half. Reached through the chain when the watched unit
    /// dies, with no targets and no firing trigger of its own.
    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        ctx.executor.channelRunes(ctx.controller, 1, /*enter_exhausted=*/true);
        ctx.events.logTrace("SIPHONING STRIKE: victim died -> channel 1 rune exhausted");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 933;
        d.def_id = R"RB(ven-146-166)RB";
        d.name = R"RB(Siphoning Strike)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-146/166)RB";
        d.collector_number = 146;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Calm, Domain::Mind};
        d.energy_cost = 4;
        d.rarity = Rarity::Epic;
        d.ability_text = R"RB(Deal 4 to a unit at a battlefield. If you control 7 or more runes, deal 7 to it instead. When it dies this turn, channel 1 rune exhausted.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-146-166-fac853d4bdd6fe47.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_933(CardRegistry& r) {
    r.registerCard(933, std::make_unique<SiphoningStrike>());
}

} // namespace riftbound
