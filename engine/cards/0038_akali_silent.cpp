#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"

#include <memory>

namespace riftbound {
namespace {

/// Akali, Silent (VEN-038)
///
///   I can't be chosen by enemy spells and abilities unless I'm in combat.
///   When I move to a battlefield, give me +2 [M] this turn.
///
/// The first clause needs the board — "unless I'm in combat" is a condition,
/// and the stateless canBeChosenByEnemy() hook cannot ask it. That is why
/// this card, and Master Yi, Unstoppable, carried ENGINE GAP notes. The
/// state-aware overload added alongside it answers the question properly.
///
/// Note the direction of the clause. It forbids being chosen OUTSIDE combat;
/// in combat she is a legal target like anything else. A coaching model read
/// it backwards and proposed a removal spell on her during a main phase.
class AkaliSilent : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    bool canBeChosenByEnemy(const GameState& state,
                            GameObjectId self) const override {
        if (!state.objectExists(self)) return true;
        const auto& me = state.getObject(self);

        // In a combat as attacker or defender: choosable.
        if (me.combat_designation != CombatDesignation::None) return true;

        // Or standing at a battlefield where a combat is under way.
        // LocationId is variant<BaseLocation, BattlefieldLocation>; the
        // battlefield id lives on the latter, not in the variant itself.
        if (me.location.has_value()) {
            if (const auto* at = std::get_if<BattlefieldLocation>(&*me.location)) {
                for (const auto& b : state.battlefields) {
                    if (b.id == at->id) return b.combat_in_progress;
                }
            }
        }
        return false;
    }

    std::vector<TriggerType> triggerTypes() const override {
        return {TriggerType::WhenIMoveToFB};
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        ctx.executor.giveTemporaryMight(ctx.source, 2);
        ctx.events.logTrace("AKALI SILENT: moved to a battlefield -> +2 [M] this turn");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 825;
        d.def_id = R"RB(ven-038-166)RB";
        d.name = R"RB(Akali, Silent)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-038/166)RB";
        d.collector_number = 38;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 4;
        d.power_cost = 1;
        d.might = 4;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB(I can't be chosen by enemy spells and abilities unless I'm in combat.When I move to a battlefield, give me +2 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-038-166-211f5a4c7d5a6c47.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_825(CardRegistry& r) {
    r.registerCard(825, std::make_unique<AkaliSilent>());
}

} // namespace riftbound
