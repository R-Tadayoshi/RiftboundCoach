#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Defender of Tomorrow (VEN-149/166) — Jayce's legend
///
///   [Empower] [2][A][A]  (Empower me. Use only if not Empowered.)
///   [1], [E]: Ready a gear.
///   [Empowered][>] [1], [E]: Ready 2 gear.
///
/// Three abilities. The third is not a replacement for the second — it is a
/// separate line that exists only while Empowered — so while Empowered both
/// are offered. Reading it the other way would be the more dangerous mistake:
/// this project's rule is never to call something illegal that might be
/// legal, and a strictly-better option the search can also see costs nothing.
///
/// The [A][A] in the Empower cost is rainbow power, which is Domain::Count
/// here. Power is paid by recycling an exhausted rune, so the cost is real
/// only because activation power costs are now actually charged — they were
/// declared and ignored until this was written.
class DefenderOfTomorrow : public LegendCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {
            // 0 — [Empower] [2][A][A]
            empowerAbility({.energy = 2, .power = 2, .power_domain = Domain::Count}),
            // 1 — [1], [E]: Ready a gear.
            ActivatedAbility{.cost = {.exhaust = true, .energy = 1},
                             .targets = TargetRequirements{.count = 1, .must_be_gear = true,
                                                            .must_be_friendly = true},
                             .needs_activation_time_target = true},
            // 2 — [Empowered][>] [1], [E]: Ready 2 gear.
            ActivatedAbility{.cost = {.exhaust = true, .energy = 1}},
        };
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, /*empower_index=*/0,
                           /*requires_empowered=*/{2});
    }

    /// "Ready a gear" — a friendly gear that is actually exhausted. Offering a
    /// ready one is offering a play that does nothing, which a search will
    /// happily rank alongside real options.
    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller,
                                                    int /*ability_index*/) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isGear()) continue;
            if (obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
            if (!obj.is_exhausted) continue;
            out.push_back(id);
        }
        return out;
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller, 1).empty();
    }

    void onActivate(CardContext& ctx, int ability_index,
                    const std::vector<GameObjectId>& targets) override {
        if (ability_index == 0) {
            empowerObject(ctx, ctx.source);
            return;
        }

        auto legal = enumerateLegalTargets(ctx.state, ctx.controller, ability_index);
        const int want = (ability_index == 2) ? 2 : 1;

        // Ability 2 readies two, which is one pick more than pickTarget can
        // publish inside one onActivate (it reserves a single set of resume
        // points). With "ready 2 gear" there is no choice worth publishing
        // when two or fewer are exhausted, and when more are, readying the
        // two most expensive is a defensible fixed rule rather than a wrong
        // one presented as a choice. Recorded rather than hidden: a proper
        // two-pick prompt needs a second reservation in Card::pickTarget.
        if (want == 2) {
            std::sort(legal.begin(), legal.end(), [&](GameObjectId a, GameObjectId b) {
                const auto& da = ctx.executor.cardDB().get(ctx.state.getObject(a).card_def_id);
                const auto& db = ctx.executor.cardDB().get(ctx.state.getObject(b).card_def_id);
                return da.energy_cost > db.energy_cost;
            });
            int done = 0;
            for (auto id : legal) {
                if (done == 2) break;
                ctx.executor.readyObject(id);
                ++done;
            }
            ctx.events.logTrace("DEFENDER OF TOMORROW: readied " +
                                 std::to_string(done) + " gear (Empowered)");
            return;
        }

        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else picked = pickTarget(ctx, "Defender of Tomorrow: ready a gear", legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        ctx.executor.readyObject(picked);
        ctx.events.logTrace("DEFENDER OF TOMORROW: readied " +
                             ctx.state.getObject(picked).name);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 936;
        d.def_id = R"RB(ven-149-166)RB";
        d.name = R"RB(Defender of Tomorrow)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-149/166)RB";
        d.collector_number = 149;
        d.card_type = CardType::Legend;
        d.domains = {Domain::Body, Domain::Mind};
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB([Empower] :rb_energy_2::rb_rune_rainbow::rb_rune_rainbow: (:rb_energy_2::rb_rune_rainbow::rb_rune_rainbow:: Empower me. Use only if not Empowered.):rb_energy_1:, :rb_exhaust:: Ready a gear.[Empowered][>] :rb_energy_1:, :rb_exhaust:: Ready 2 gear.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-149-166-d841846f9d678061.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_936(CardRegistry& r) {
    r.registerCard(936, std::make_unique<DefenderOfTomorrow>());
}

} // namespace riftbound
