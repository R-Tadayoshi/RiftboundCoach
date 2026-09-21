#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Hextech Formula (VEN-062/166)
///
///   This enters exhausted.
///   [E]: Empower another gear. (It becomes Empowered if it's not already.)
///
/// The only card so far that empowers something OTHER than itself, which is
/// why it needs no empowerGate at all: its one ability is always legal, and
/// the "if it's not already" is CR 441.1.c — empowering an already-Empowered
/// object does nothing, which empowerObject implements by doing nothing
/// rather than by erroring.
///
/// "another gear" is friendly-or-not as printed, but a gear that is already
/// Empowered is not offered: a play that provably does nothing is not a
/// decision, and offering it only widens the search.
class HextechFormula : public GearCard {
public:
    const CardDef& def() const override { return def_; }

    void onPlay(CardContext& ctx) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        ctx.executor.exhaustObject(ctx.source);
    }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {ActivatedAbility{
            .cost = {.exhaust = true},
            .targets = TargetRequirements{.count = 1, .must_be_gear = true},
            .needs_activation_time_target = true,
        }};
    }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId /*controller*/,
                                                    int /*ability_index*/) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isGear()) continue;
            if (!obj.location.has_value()) continue;
            if (obj.is_empowered) continue;      // CR 441.1.b
            out.push_back(id);
        }
        return out;
    }

    void onActivate(CardContext& ctx, int /*ability_index*/,
                    const std::vector<GameObjectId>& targets) override {
        auto legal = enumerateLegalTargets(ctx.state, ctx.controller, 0);
        // "another": never itself, however the target arrived.
        legal.erase(std::remove(legal.begin(), legal.end(), ctx.source), legal.end());

        GameObjectId picked = kInvalidId;
        if (!targets.empty() && targets[0] != ctx.source) picked = targets[0];
        else picked = pickTarget(ctx, "Hextech Formula: empower another gear", legal);
        if (picked == kInvalidId || picked == ctx.source) return;
        empowerObject(ctx, picked);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 849;
        d.def_id = R"RB(ven-062-166)RB";
        d.name = R"RB(Hextech Formula)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-062/166)RB";
        d.collector_number = 62;
        d.card_type = CardType::Gear;
        d.domains = {Domain::Mind};
        d.energy_cost = 2;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB(This enters exhausted.:rb_exhaust:: Empower another gear. (It becomes Empowered if it's not already.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-062-166-1578a8d37b1fde1e.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_849(CardRegistry& r) {
    r.registerCard(849, std::make_unique<HextechFormula>());
}

} // namespace riftbound
