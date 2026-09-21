#include "cards/card_helpers.h"

#include <algorithm>
#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Decree of Discord (VEN-107/166)
///
///   Return any number of enemy Order ([Order]) units with total Might 5 or
///   less to their owners' hands.
///
/// "TOTAL MIGHT 5 OR LESS" is a running cap, not a per-unit one: three
/// 1-Might units and a 2 is a legal set, a single 6 is not, and a 5 rules
/// out everything else. So the legality of each pick depends on what has
/// already been picked, which is exactly what pickTargets hands its
/// `legal_fn` — the picks so far, before every prompt. Each prompt offers
/// only what still fits, and the card stops on its own when nothing does.
///
/// THE CAP IS ALSO THE BOUND ON HOW MANY. A unit has at least 1 Might, so
/// "total 5 or less" can never be more than five units. The cap comes from
/// the printed text rather than from counting the board, which matters
/// because the resume machinery sizes its bookkeeping from it and that size
/// must not change between prompts.
///
/// "ANY NUMBER" includes none, so the picker runs with `optional` and the
/// stop option is on every prompt including the first — a spell that cannot
/// be declined would be a different card, and there are boards where
/// bouncing a unit is a favour.
///
/// MIGHT IS READ AT EACH PROMPT, not once at the start. A unit buffed in
/// response to this spell costs more of the budget when it is picked; the
/// card says "with total Might 5 or less" and does not say when.
class DecreeOfDiscord : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    /// Playable while a single enemy Order unit fits under the cap. "Any
    /// number" would make it legal with none, but a spell that can do
    /// nothing at all is not worth an action-vocab slot — and unlike
    /// Shadows of the Past, whose trashes fill during its own resolution,
    /// nothing here can arrive in between.
    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller) const override {
        return fitting(state, controller, {});
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller).empty();
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>&) override {
        GameState& st = ctx.state;
        const PlayerId me = ctx.controller;
        auto picks = pickTargets(
            ctx, "Decree of Discord: return enemy Order units, total Might 5 or less",
            [&st, me](const std::vector<GameObjectId>& so_far) {
                return fitting(st, me, so_far);
            },
            /*max_count=*/kMightBudget, /*optional=*/true);
        if (!picks.has_value()) return;   // suspended — MUST return

        for (auto id : *picks) {
            if (!ctx.state.objectExists(id)) continue;
            ctx.events.logTrace("DECREE OF DISCORD: returned " +
                                 ctx.state.getObject(id).name + " to its owner's hand");
            ctx.executor.bounceToHand(id);
        }
    }

private:
    static constexpr int kMightBudget = 5;

    static bool isOrder(const GameObject& obj) {
        for (auto d : obj.domains) if (d == Domain::Order) return true;
        return false;
    }

    /// Enemy Order units that still fit under the budget, given what is
    /// already picked.
    static std::vector<GameObjectId> fitting(const GameState& state,
                                              PlayerId controller,
                                              const std::vector<GameObjectId>& so_far) {
        int spent = 0;
        for (auto id : so_far) {
            if (state.objectExists(id)) spent += state.getObject(id).current_might;
        }

        std::vector<GameObjectId> out;
        for (const auto& [id, obj] : state.objects) {
            if (!obj.isUnit()) continue;
            if (obj.controller == controller) continue;
            if (!obj.location.has_value()) continue;
            if (!isOrder(obj)) continue;
            if (obj.untargetable_by_enemy || obj.untargetable_by_enemy_this_turn) continue;
            if (std::find(so_far.begin(), so_far.end(), id) != so_far.end()) continue;
            if (spent + obj.current_might > kMightBudget) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 894;
        d.def_id = R"RB(ven-107-166)RB";
        d.name = R"RB(Decree of Discord)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-107/166)RB";
        d.collector_number = 107;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Chaos};
        d.energy_cost = 1;
        d.power_cost = 1;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB(Return any number of enemy Order (:rb_rune_order:) units with total Might 5 or less to their owners' hands.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-107-166-a953676796f513d1.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_894(CardRegistry& r) {
    r.registerCard(894, std::make_unique<DecreeOfDiscord>());
}

} // namespace riftbound
