#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Decree of Strength (VEN-085/166)
///
///   Choose an opponent. They reveal their hand and you choose a Mind card
///   from it. They recycle that card.
///
/// "Choose an opponent" is not a choice in a two-player game, so no prompt is
/// published for it — one legal option is not a decision, and offering it
/// only widens the search.
///
/// The reveal is what makes the rest legal: the caster is choosing from cards
/// they can now see. That matters here and nowhere else in this project — the
/// extractor refuses to surface an opponent's hidden cards precisely because
/// no effect has revealed them. An effect that DOES reveal them is the
/// exception the rule is shaped around, and it lives inside the engine, where
/// the information was never hidden in the first place.
class DecreeOfStrength : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    /// Mind cards in the opponent's hand. Recycling is from hand, so a Mind
    /// card anywhere else is not a target, and an opponent holding no Mind
    /// card makes this spell unplayable rather than playable and wasted.
    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller) const override {
        std::vector<GameObjectId> out;
        for (auto p : {PlayerId::Player1, PlayerId::Player2}) {
            if (p == controller) continue;
            for (auto id : state.player(p).hand) {
                if (!state.objectExists(id)) continue;
                const auto& obj = state.getObject(id);
                for (auto d : obj.domains) {
                    if (d == Domain::Mind) { out.push_back(id); break; }
                }
            }
        }
        return out;
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller).empty();
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        // Re-enumerated at resolution: the opponent may have played the card
        // in response, and CR fizzles an illegal target rather than reaching
        // for another.
        auto legal = enumerateLegalTargets(ctx.state, ctx.controller);
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) {
            for (auto id : legal) if (id == targets[0]) picked = id;
            if (picked == kInvalidId) {
                ctx.events.logTrace("DECREE OF STRENGTH: chosen card is no longer in hand");
                return;
            }
        } else {
            if (legal.empty()) {
                ctx.events.logTrace("DECREE OF STRENGTH: no Mind card in the opponent's hand");
                return;
            }
            picked = pickTarget(ctx, "Decree of Strength: a Mind card from their hand", legal);
        }
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        const auto owner = ctx.state.getObject(picked).owner;
        auto& hand = ctx.state.player(owner).hand;
        hand.erase(std::remove(hand.begin(), hand.end(), picked), hand.end());
        ctx.executor.recycleCards(owner, {picked});
        ctx.events.logTrace("DECREE OF STRENGTH: recycled a Mind card from " +
                             std::string(toString(owner)) + "'s hand");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 872;
        d.def_id = R"RB(ven-085-166)RB";
        d.name = R"RB(Decree of Strength)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-085/166)RB";
        d.collector_number = 85;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Body};
        d.energy_cost = 1;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB(Choose an opponent. They reveal their hand and you choose a Mind (:rb_rune_mind:) card from it. They recycle that card.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-085-166-80bab34468ef28d5.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_872(CardRegistry& r) {
    r.registerCard(872, std::make_unique<DecreeOfStrength>());
}

} // namespace riftbound
