#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Kennen, Keeper of Balance (VEN-135/166)
///
///   [Hidden]
///   When you play me or I attack, you may pay [2] to [Stun] a unit.
///   While there's a stunned enemy unit here, I have +2 [M].
///
/// TWO TRIGGERS, ONE EFFECT. "When you play me OR I attack" is two entries
/// in triggerTypes() and no dispatch on `firing_trigger`, because both do
/// the same thing — and played [Hidden] from face down, this fires on the
/// reveal and again on the attack, which is most of the card's value.
///
/// THE STUN IS NOT RESTRICTED TO ENEMIES. "Stun a unit" — your own is a
/// legal choice and occasionally the right one, since a stunned unit still
/// defends and still holds a battlefield. The +2 [M] clause is the half that
/// says "enemy", and only that half.
///
/// THE BUFF IS NOT TIED TO THE STUN. "While there's a stunned enemy unit
/// here" is a board condition, so Kennen grows from a unit somebody else
/// stunned, and shrinks again the moment that unit unstuns — which is why it
/// is an aura recomputed each pass and not a bonus applied when the trigger
/// resolved.
///
/// "HERE" is Kennen's own location. A stunned enemy elsewhere does nothing.
class KennenKeeperOfBalance : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<TriggerType> triggerTypes() const override {
        return {TriggerType::WhenYouPlayMe, TriggerType::WhenIAttack};
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;

        const int yes = confirmOptional(
            ctx, "Kennen, Keeper of Balance: pay [2] to [Stun] a unit",
            [&ctx]() {
                return ctx.state.objectExists(ctx.source) &&
                       readyRunes(ctx.state, ctx.controller) >= 2 &&
                       !stunnable(ctx.state).empty();
            });
        if (yes <= 0) return;   // -1 yielded for agent input, 0 declined/illegal

        auto legal = stunnable(ctx.state);
        auto picked = pickTarget(ctx, "Kennen, Keeper of Balance: stun a unit", legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        // Pay only once a target is in hand: the energy buys the stun, and
        // a payment made before the pick could be spent on nothing if the
        // target evaporated while the agent decided.
        if (!payEnergyFromRunes(ctx, 2)) {
            ctx.events.logTrace("KENNEN, KEEPER OF BALANCE: could not pay [2] "
                                 "at execution -> no stun");
            return;
        }
        ctx.executor.stunUnitBy(picked, ctx.source);
        ctx.events.logTrace("KENNEN, KEEPER OF BALANCE: paid [2] -> stunned " +
                             ctx.state.getObject(picked).name);
    }

    void applyPassiveAura(GameState& state, PlayerId controller,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        auto& me = state.getObject(self);
        if (!me.location.has_value()) return;

        bool stunned_enemy_here = false;
        for (const auto& [id, obj] : state.objects) {
            if (obj.controller == controller) continue;
            if (!obj.isUnit() || !obj.is_stunned) continue;
            if (!obj.location.has_value()) continue;
            if (*obj.location != *me.location) continue;
            stunned_enemy_here = true;
            break;
        }
        if (!stunned_enemy_here) return;

        GameObject::AuraEffect ae;
        ae.source = self;
        ae.might_bonus = 2;
        me.aura_effects.push_back(ae);
    }

private:
    /// Ready runes in base — what payEnergyFromRunes will exhaust. Counted
    /// here so the offer is never made when it cannot be paid.
    static int readyRunes(const GameState& state, PlayerId controller) {
        const auto base = BaseLocation{controller};
        int n = 0;
        for (const auto& [id, obj] : state.objects) {
            if (!obj.isRune() || obj.controller != controller) continue;
            if (obj.is_exhausted) continue;
            if (!obj.location.has_value() || *obj.location != LocationId{base}) continue;
            ++n;
        }
        return n;
    }

    /// "A unit" — either side's, anywhere on the board. Already-stunned
    /// units are excluded: stunning one again does nothing.
    static std::vector<GameObjectId> stunnable(const GameState& state) {
        std::vector<GameObjectId> out;
        for (const auto& [id, obj] : state.objects) {
            if (!obj.isUnit()) continue;
            if (!obj.location.has_value()) continue;
            if (obj.is_stunned) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 922;
        d.def_id = R"RB(ven-135-166)RB";
        d.name = R"RB(Kennen, Keeper of Balance)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-135/166)RB";
        d.collector_number = 135;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Order};
        d.energy_cost = 3;
        d.might = 2;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Hidden);
        d.ability_text = R"RB([Hidden] (Hide now for :rb_rune_rainbow: to react with later for :rb_energy_0:.)When you play me or I attack, you may pay :rb_energy_2: to [Stun] a unit. (It doesn't deal combat damage this turn.)While there's a stunned enemy unit here, I have +2 :rb_might:.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-135-166-3e7fd2bca685433e.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_922(CardRegistry& r) {
    r.registerCard(922, std::make_unique<KennenKeeperOfBalance>());
}

} // namespace riftbound
