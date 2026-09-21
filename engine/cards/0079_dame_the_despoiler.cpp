#include "cards/card_helpers.h"

#include <algorithm>
#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Dame the Despoiler (VEN-079/166)
///
///   [Empower] [5][Body]
///   [Empowered][>] When I attack or defend, choose a unit here. Increase my
///   Might to its Might this turn, then give me +1 [M] this turn.
///
/// "INCREASE ... TO" IS A FLOOR, NOT AN ASSIGNMENT. Increasing to a smaller
/// number is not an increase, so a Dame at 6 choosing a 4 gains nothing from
/// the first clause — and still gains the +1, because "then" makes that a
/// separate step that does not depend on the first doing anything.
///
/// Implemented as a temporary Might delta of `max(0, theirs - mine)` rather
/// than by setting a base Might, which is both what the text means and the
/// only thing the engine can express this turn: nothing sets a base Might
/// with a turn-scoped revert.
///
/// "A UNIT HERE" — either side's, at the battlefield she is fighting over.
/// Choosing the biggest enemy is the obvious line and choosing a friendly
/// one is occasionally better, so both are offered.
///
/// THE MIGHT IS READ WHEN THE TRIGGER RESOLVES. A unit buffed in response is
/// worth more; one shrunk in response is worth less. The card says "its
/// Might" and does not say when, so it is read at the only moment that is
/// unambiguous.
class DameTheDespoiler : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {empowerAbility({.energy = 5, .power = 1,
                                .power_domain = Domain::Body})};
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, /*empower_index=*/0, {});
    }

    void onActivate(CardContext& ctx, int ability_index,
                    const std::vector<GameObjectId>&) override {
        if (ability_index == 0) empowerObject(ctx, ctx.source);
    }

    TriggerType triggerType() const override {
        return TriggerType::WhenIAttackOrDefend;
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        if (!isEmpowered(ctx.state, ctx.source)) {
            ctx.events.logTrace("DAME THE DESPOILER: in combat but not [Empowered] "
                                 "-> no effect");
            return;
        }

        auto legal = unitsHere(ctx.state, ctx.source);
        if (legal.empty()) {
            // "Choose a unit here" with nothing to choose. The +1 is part of
            // the same sentence and does not survive a failed choice.
            ctx.events.logTrace("DAME THE DESPOILER: no other unit here to choose");
            return;
        }
        auto picked = pickTarget(ctx, "Dame the Despoiler: match a unit's Might", legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        const int mine = ctx.state.getObject(ctx.source).current_might;
        const int theirs = ctx.state.getObject(picked).current_might;
        const int lift = std::max(0, theirs - mine);
        if (lift > 0) ctx.executor.giveTemporaryMight(ctx.source, lift);
        ctx.executor.giveTemporaryMight(ctx.source, 1);

        ctx.events.logTrace("DAME THE DESPOILER: matched " +
                             ctx.state.getObject(picked).name + " (" +
                             std::to_string(theirs) + "[M]) -> +" +
                             std::to_string(lift) + " then +1 this turn");
    }

private:
    /// Units at the Dame's battlefield, hers excluded. Either controller:
    /// the text says "a unit here" with no side named.
    static std::vector<GameObjectId> unitsHere(const GameState& state,
                                                GameObjectId self) {
        std::vector<GameObjectId> out;
        if (!state.objectExists(self)) return out;
        const auto here = state.getObject(self).battlefieldId();
        if (!here) return out;

        for (const auto& [id, obj] : state.objects) {
            if (id == self) continue;
            if (!obj.isUnit()) continue;
            const auto bf = obj.battlefieldId();
            if (!bf || *bf != *here) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 866;
        d.def_id = R"RB(ven-079-166)RB";
        d.name = R"RB(Dame the Despoiler)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-079/166)RB";
        d.collector_number = 79;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Body};
        d.energy_cost = 5;
        d.might = 5;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB([Empower] :rb_energy_5::rb_rune_body: (:rb_energy_5::rb_rune_body:: Empower me. Use only if not Empowered.)[Empowered][>] When I attack or defend, choose a unit here. Increase my Might to its Might this turn, then give me +1 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-079-166-492de79c19135ada.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_866(CardRegistry& r) {
    r.registerCard(866, std::make_unique<DameTheDespoiler>());
}

} // namespace riftbound
