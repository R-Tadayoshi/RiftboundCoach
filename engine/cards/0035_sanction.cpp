#include "cards/card_helpers.h"

#include <memory>
#include <string>
#include <vector>

namespace riftbound {
namespace {

/// Sanction (VEN-035/166)
///
///   [Reaction]
///   Choose one —
///     Empower a unit. Disempower it at end of turn.
///     Disempower a unit that's [Empowered]. Empower it at end of turn.
///
/// A LOAN, NOT A GIFT, in both directions. Mode 0 buys a turn of somebody's
/// [Empowered] clauses and hands the latch back; mode 1 switches an enemy's
/// off for the turn that matters and returns it. Being a [Reaction] is the
/// whole card — it is cast in a showdown, after the board has committed.
///
/// THE REVERSAL IS A DELAYED ABILITY, not a toggle. Toggling at end of turn
/// would read the latch as it is then, and something else may have moved it:
/// mode 0 says "disempower it" unconditionally, and if the unit was
/// disempowered and re-empowered in between, disempowering is still what the
/// card says. So the DIRECTION is stashed alongside the target and the
/// delayed half obeys it rather than inferring it.
///
/// Both live in the spell object's `card_counters`, because a delayed
/// ability fires with `ctx.source` set to the card that armed it and no
/// targets — the same shape Deadly Flourish uses for "when IT dies".
///
/// Each mode is offered only when it has a target: mode 0 needs a unit that
/// is NOT Empowered (empowerObject is idempotent, so empowering an Empowered
/// unit would pay a card for nothing), mode 1 needs one that is.
class Sanction : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    bool isReactionAbility() const override { return true; }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId /*controller*/) const override {
        auto out = unitsByLatch(state, /*empowered=*/false);
        for (auto id : unitsByLatch(state, /*empowered=*/true)) out.push_back(id);
        return out;
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller).empty();
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>&) override {
        auto to_empower = unitsByLatch(ctx.state, /*empowered=*/false);
        auto to_disempower = unitsByLatch(ctx.state, /*empowered=*/true);

        uint32_t legal = 0;
        if (!to_empower.empty())    legal |= 0b01;
        if (!to_disempower.empty()) legal |= 0b10;
        if (legal == 0) return;

        const int mode = pickMode(ctx, "Sanction", /*num_modes=*/2,
                                  {"Empower a unit until end of turn",
                                   "Disempower an [Empowered] unit until end of turn"},
                                  legal);
        if (mode < 0) return;   // -1 yielded for agent input, -2 no legal mode

        const bool empower_now = (mode == 0);
        auto picked = pickTarget(
            ctx,
            empower_now ? "Sanction: empower a unit" : "Sanction: disempower a unit",
            empower_now ? to_empower : to_disempower);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        if (empower_now) empowerObject(ctx, picked);
        else             disempowerObject(ctx, picked);

        if (ctx.state.objectExists(ctx.source)) {
            auto& self = ctx.state.getObject(ctx.source);
            self.card_counters["__sanction_target"] = static_cast<int>(picked);
            self.card_counters["__sanction_empower_at_eot"] = empower_now ? 0 : 1;
        }

        DelayedAbility da;
        da.source = ctx.source;
        da.card_def_id = cardDefId();
        da.controller = ctx.controller;
        da.trigger = TriggerType::AtEndOfTurn;
        ctx.state.delayed_abilities.push_back(da);

        ctx.events.logTrace(std::string("SANCTION: ") +
                             (empower_now ? "empowered " : "disempowered ") +
                             ctx.state.getObject(picked).name +
                             " — reverses at end of turn");
    }

    TriggerType triggerType() const override { return TriggerType::AtEndOfTurn; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        auto& self = ctx.state.getObject(ctx.source);
        auto t = self.card_counters.find("__sanction_target");
        auto d = self.card_counters.find("__sanction_empower_at_eot");
        if (t == self.card_counters.end() || d == self.card_counters.end()) return;

        const auto target = static_cast<GameObjectId>(t->second);
        if (target == kInvalidId || !ctx.state.objectExists(target)) return;

        if (d->second == 1) empowerObject(ctx, target);
        else                disempowerObject(ctx, target);
        ctx.events.logTrace("SANCTION: end of turn — reversed on " +
                             ctx.state.getObject(target).name);
    }

private:
    /// Units on the board whose latch is in the given state.
    static std::vector<GameObjectId> unitsByLatch(const GameState& state,
                                                   bool empowered) {
        std::vector<GameObjectId> out;
        for (const auto& [id, obj] : state.objects) {
            if (!obj.isUnit()) continue;
            if (!obj.location.has_value()) continue;
            if (obj.is_empowered != empowered) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 822;
        d.def_id = R"RB(ven-035-166)RB";
        d.name = R"RB(Sanction)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-035/166)RB";
        d.collector_number = 35;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Calm};
        d.energy_cost = 3;
        d.power_cost = 1;
        d.rarity = Rarity::Uncommon;
        d.keywords.set(Keyword::Reaction);
        d.ability_text = R"RB([Reaction] (Play any time, even before spells and abilities resolve.)Choose one —Empower a unit. Disempower it at end of turn.Disempower a unit that's [Empowered]. Empower it at end of turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-035-166-182855d3308b9ae1.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_822(CardRegistry& r) {
    r.registerCard(822, std::make_unique<Sanction>());
}

} // namespace riftbound
