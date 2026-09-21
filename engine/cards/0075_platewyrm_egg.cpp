#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Platewyrm Egg (VEN-075/166)
///
///   This enters exhausted.
///   [Empower] — [1], [E]  (Pay the cost: Empower this. Use only if not
///                          Empowered.)
///   [Reaction][>] [E]: [Add] [1]. If this is [Empowered], [Add] [2] instead.
///
/// Two abilities that both cost [E], so the egg does one thing per ready
/// cycle: either spend a turn empowering itself or tap for energy. That is
/// the whole card — an investment that pays 2 instead of 1 from then on — and
/// it only reads that way to a search if the [E] on the Empower ability is
/// real. Both are declared with .exhaust, so the generator's own
/// "must be ready if exhaust required" check enforces it.
class PlatewyrmEgg : public GearCard {
public:
    const CardDef& def() const override { return def_; }

    // "This enters exhausted."
    void onPlay(CardContext& ctx) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        ctx.executor.exhaustObject(ctx.source);
    }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {
            // 0 — [Empower] — [1], [E]
            empowerAbility({.exhaust = true, .energy = 1}),
            // 1 — [Reaction] [E]: [Add] [1] / [2]
            ActivatedAbility{.cost = {.exhaust = true},
                             .is_action = false, .is_reaction = true},
        };
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        // Ability 1 works either way — it just pays more when Empowered — so
        // only the [Empower] ability is gated.
        return empowerGate(state, self, ability_index, /*empower_index=*/0, {});
    }

    void onActivate(CardContext& ctx, int ability_index,
                    const std::vector<GameObjectId>&) override {
        if (ability_index == 0) {
            empowerObject(ctx, ctx.source);
            return;
        }
        const int add = isEmpowered(ctx.state, ctx.source) ? 2 : 1;
        ctx.executor.addFloatingEnergy(ctx.controller, add);
        ctx.events.logTrace("PLATEWYRM EGG: add " + std::to_string(add) +
                             (add == 2 ? " (Empowered)" : ""));
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 862;
        d.def_id = R"RB(ven-075-166)RB";
        d.name = R"RB(Platewyrm Egg)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-075/166)RB";
        d.collector_number = 75;
        d.card_type = CardType::Gear;
        d.domains = {Domain::Body};
        d.energy_cost = 3;
        d.rarity = Rarity::Common;
        d.keywords.set(Keyword::Reaction);
        d.ability_text = R"RB(This enters exhausted.[Empower] — :rb_energy_1:, :rb_exhaust: (Pay the cost: Empower this. Use only if not Empowered.)[Reaction][>] :rb_exhaust:: [Add] :rb_energy_1:. If this is [Empowered], [Add] :rb_energy_2: instead.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-075-166-04883ccafc965bea.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_862(CardRegistry& r) {
    r.registerCard(862, std::make_unique<PlatewyrmEgg>());
}

} // namespace riftbound
