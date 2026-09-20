#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Crumbling Sands (VEN-039/166)
///
///   [Reaction] Counter a spell if an opponent has played another spell
///   this turn.
///
/// "another spell" is the condition, and it is about the OPPONENT's turn
/// history, not this card's target: the spell on the chain may well be the
/// second one they played, but it may also be the first, with the earlier
/// one already resolved. So this reads a per-player count of spells played
/// this turn rather than anything on the chain. `cards_played_this_turn`
/// could not answer it — a unit and a spell both increment it.
///
/// Playable only when the condition holds AND there is a spell to counter.
/// Both are hasLegalTargets' job: a Reaction that resolves into nothing is
/// a wasted card the search would happily recommend.
class CrumblingSands : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        if (!opponentPlayedASpell(state, controller)) return false;
        for (auto it = state.chain.items.rbegin(); it != state.chain.items.rend(); ++it) {
            if (it->is_spell) return true;
        }
        return false;
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>& /*targets*/) override {
        // Re-checked at resolution, not just at play time. The chain resolves
        // top-down and this card is a [Reaction]: between playing it and it
        // resolving, the spell it was aimed at can be countered by something
        // else, and the count it gates on cannot go down but the chain can
        // empty out.
        if (!opponentPlayedASpell(ctx.state, ctx.controller)) {
            ctx.events.logTrace("CRUMBLING SANDS: no opposing spell played this turn");
            return;
        }
        counterChainTop(ctx);
    }

private:
    static bool opponentPlayedASpell(const GameState& state, PlayerId controller) {
        for (auto p : {PlayerId::Player1, PlayerId::Player2}) {
            if (p == controller) continue;
            if (state.player(p).spells_played_this_turn > 0) return true;
        }
        return false;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 826;
        d.def_id = R"RB(ven-039-166)RB";
        d.name = R"RB(Crumbling Sands)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-039/166)RB";
        d.collector_number = 39;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Calm};
        d.energy_cost = 1;
        d.power_cost = 1;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Reaction);
        d.ability_text = R"RB([Reaction] (Play any time, even before spells and abilities resolve.)Counter a spell if an opponent has played another spell this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-039-166-5517272b06eaf0ef.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_826(CardRegistry& r) {
    r.registerCard(826, std::make_unique<CrumblingSands>());
}

} // namespace riftbound
