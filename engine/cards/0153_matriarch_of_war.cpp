#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Matriarch of War (VEN-153/166)
///
///   When you empower something else, empower me.
///   Disempower me, [A], [E]: Ready a unit.
///
/// The card CR 441.2.a exists for: "becoming Empowered is an event that can
/// be referenced". Before that event existed, empowering was a silent write
/// to a flag and this legend had nothing to listen to.
///
/// "something ELSE" is enforced by the trigger manager rather than here,
/// because a legend that empowered herself would then be answering her own
/// event — the loop belongs to be cut where the event and the listener are
/// both in hand, not in each card that listens.
///
/// She is a free Ready every time the deck does what it wants to do anyway,
/// which is the whole reason to play an Empower deck around her.
class MatriarchOfWar : public LegendCard {
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
            .cost = {.exhaust = true, .power = 1, .power_domain = Domain::Count},
            .targets = TargetRequirements{.count = 1, .must_be_unit = true,
                                           .must_be_friendly = true},
            .needs_activation_time_target = true,
        }};
    }

    /// Legal only while Empowered — Disempower is part of the cost.
    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, /*empower_index=*/-1,
                           /*requires_empowered=*/{0});
    }

    /// Only exhausted units: readying a ready one does nothing, and a play
    /// that provably does nothing is not a decision.
    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller,
                                                    int /*ability_index*/) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit()) continue;
            if (obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
            if (!obj.is_exhausted) continue;
            out.push_back(id);
        }
        return out;
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller, 0).empty();
    }

    void onActivate(CardContext& ctx, int /*ability_index*/,
                    const std::vector<GameObjectId>& targets) override {
        disempowerObject(ctx, ctx.source);   // part of the cost
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else picked = pickTarget(ctx, "Matriarch of War: ready a unit",
                                 enumerateLegalTargets(ctx.state, ctx.controller, 0));
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        ctx.executor.readyObject(picked);
        ctx.events.logTrace("MATRIARCH OF WAR: readied " +
                             ctx.state.getObject(picked).name);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 940;
        d.def_id = R"RB(ven-153-166)RB";
        d.name = R"RB(Matriarch of War)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-153/166)RB";
        d.collector_number = 153;
        d.card_type = CardType::Legend;
        d.domains = {Domain::Body, Domain::Order};
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB(When you empower something else, empower me. (I become Empowered if I'm not already.)Disempower me, :rb_rune_rainbow:, :rb_exhaust:: Ready a unit.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-153-166-227b8336f47f608a.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_940(CardRegistry& r) {
    r.registerCard(940, std::make_unique<MatriarchOfWar>());
}

} // namespace riftbound
