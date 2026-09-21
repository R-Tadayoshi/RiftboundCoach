#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Guttural Roar (VEN-072/166)
///
///   [Action] Give a unit +2 [M] this turn. If it's [Empowered], give it
///   +4 [M] this turn instead.
///
/// "INSTEAD" — +4 replaces +2, it does not add to it. Reading the two
/// clauses as cumulative would make this a +6 on an Empowered unit, and
/// combat maths is precisely where a search will spend that extra point.
///
/// The Empowered check is at RESOLUTION, not at play. This is an [Action],
/// so it can be played in a showdown and sit on the chain while the board
/// moves under it: a unit empowered after the spell was played still gets
/// the +4, and one disempowered in response gets the +2. That is what "if
/// it's Empowered" means at the time the effect happens.
class GutturalRoar : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    bool isActionAbility() const override { return true; }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId /*controller*/) const override {
        return anyUnit(state);
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller).empty();
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        auto legal = anyUnit(ctx.state);
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else if (!legal.empty())
            picked = pickTarget(ctx, "Guttural Roar: give a unit +2 [M] this turn", legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        const int amount = isEmpowered(ctx.state, picked) ? 4 : 2;
        ctx.executor.giveTemporaryMight(picked, amount);
        ctx.events.logTrace("GUTTURAL ROAR: " + ctx.state.getObject(picked).name +
                             (amount == 4 ? " is [Empowered] -> +4 [M] this turn"
                                          : " -> +2 [M] this turn"));
    }

private:
    static std::vector<GameObjectId> anyUnit(const GameState& state) {
        std::vector<GameObjectId> out;
        for (const auto& [id, obj] : state.objects) {
            if (!obj.isUnit()) continue;
            if (!obj.location.has_value()) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 859;
        d.def_id = R"RB(ven-072-166)RB";
        d.name = R"RB(Guttural Roar)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-072/166)RB";
        d.collector_number = 72;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Body};
        d.energy_cost = 2;
        d.rarity = Rarity::Common;
        d.keywords.set(Keyword::Action);
        d.ability_text = R"RB([Action] (Play on your turn or in showdowns.)Give a unit +2 :rb_might: this turn. If it's [Empowered], give it +4 :rb_might: this turn instead.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-072-166-fe5479c9343f2c7e.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_859(CardRegistry& r) {
    r.registerCard(859, std::make_unique<GutturalRoar>());
}

} // namespace riftbound
