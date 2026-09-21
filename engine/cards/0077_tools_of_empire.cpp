#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Tools of Empire (VEN-077/166)
///
///   [Empower] [2]  (Empower this. Use only if not Empowered.)
///   [E]: Give a unit +2 [M] this turn. If this is [Empowered], give that
///        unit +4 [M] this turn instead.
///
/// Different shape from the Tome and the Disc: the payout ability does NOT
/// disempower, so once wound up it stays wound up and every later use is the
/// bigger one. That makes the Empower a one-off investment rather than a
/// recharge, and the two cards should not be ranked as if they were the same
/// card with different numbers.
///
/// Only the [Empower] ability is gated — ability 1 works either way, it just
/// pays more.
class ToolsOfEmpire : public GearCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {
            empowerAbility({.energy = 2}),
            ActivatedAbility{.cost = {.exhaust = true},
                             .targets = TargetRequirements{.count = 1, .must_be_unit = true},
                             .needs_activation_time_target = true},
        };
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, 0, {});
    }

    /// "a unit" — either side's, as printed.
    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller,
                                                    int /*ability_index*/) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit()) continue;
            if (!obj.location.has_value()) continue;
            if (obj.controller != controller && obj.untargetable_by_enemy) continue;
            out.push_back(id);
        }
        return out;
    }

    void onActivate(CardContext& ctx, int ability_index,
                    const std::vector<GameObjectId>& targets) override {
        if (ability_index == 0) {
            empowerObject(ctx, ctx.source);
            return;
        }
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else picked = pickTarget(ctx, "Tools of Empire: give a unit might",
                                 enumerateLegalTargets(ctx.state, ctx.controller, 1));
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        const int amount = isEmpowered(ctx.state, ctx.source) ? 4 : 2;
        ctx.executor.giveTemporaryMight(picked, amount);
        ctx.events.logTrace("TOOLS OF EMPIRE: +" + std::to_string(amount) +
                             "[M] this turn -> " + ctx.state.getObject(picked).name);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 864;
        d.def_id = R"RB(ven-077-166)RB";
        d.name = R"RB(Tools of Empire)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-077/166)RB";
        d.collector_number = 77;
        d.card_type = CardType::Gear;
        d.domains = {Domain::Body};
        d.energy_cost = 4;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB([Empower] :rb_energy_2: (:rb_energy_2:: Empower this. Use only if not Empowered.):rb_exhaust:: Give a unit +2 :rb_might: this turn. If this is [Empowered], give that unit +4 :rb_might: this turn instead.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-077-166-74c23d86d5607a8e.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_864(CardRegistry& r) {
    r.registerCard(864, std::make_unique<ToolsOfEmpire>());
}

} // namespace riftbound
