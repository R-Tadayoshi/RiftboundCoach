#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Jayce, Brilliant Inventor (VEN-068/166)
///
///   When you play me or the first time you play a non-token gear each turn,
///   you may ready something besides me that's exhausted.
///
/// Three clauses worth reading separately:
///
/// "the first time ... each turn" is per-object state, and per-object state
/// that resets each turn cannot just be a counter: PlayerState::
/// resetTurnTracking runs for the turn player only, and a gear can be played
/// on either player's turn. So the counter is stamped with the turn it
/// belongs to, the same shape as GameState::spellsPlayedThisTurn.
///
/// "non-token": tokens are created, not played, so WhenYouPlayAGear does not
/// fire for them — EffectExecutor::createToken emits no CardPlayedEvent. The
/// one path that could is an effect that PLAYS a token gear through
/// playIgnoringCost, and CardContext does not carry which object was played,
/// so this card cannot tell. Left as is rather than guessed at: the miss is a
/// free extra ready in a rare corner, not a wrong board.
///
/// "you may ... besides me" is implemented as: ready one if there is one.
/// Readying a friendly exhausted object is never a drawback, so the declined
/// branch is strictly dominated and only costs the search width.
class JayceBrilliantInventor : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<TriggerType> triggerTypes() const override {
        return {TriggerType::WhenYouPlayMe, TriggerType::WhenYouPlayAGear};
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;

        if (ctx.firing_trigger == TriggerType::WhenYouPlayAGear) {
            auto& self = ctx.state.getObject(ctx.source);
            const int turn = ctx.state.turn.turn_number;
            if (self.card_counters["inventor_gear_turn"] == turn &&
                self.card_counters["inventor_gear_used"] != 0) {
                ctx.events.logTrace("JAYCE, BRILLIANT INVENTOR: already fired on a gear this turn");
                return;
            }
            self.card_counters["inventor_gear_turn"] = turn;
            self.card_counters["inventor_gear_used"] = 1;
        }

        auto legal = readyable(ctx.state, ctx.controller, ctx.source);
        if (legal.empty()) {
            ctx.events.logTrace("JAYCE, BRILLIANT INVENTOR: nothing exhausted to ready");
            return;
        }
        GameObjectId picked = pickTarget(ctx, "Jayce, Brilliant Inventor: ready something", legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        ctx.executor.readyObject(picked);
        ctx.events.logTrace("JAYCE, BRILLIANT INVENTOR: readied " +
                             ctx.state.getObject(picked).name);
    }

private:
    /// "something besides me that's exhausted" — anything of yours on the
    /// board, runes included, since a rune is a Game Object and readying one
    /// is the whole point of the card on a turn you have spent out.
    static std::vector<GameObjectId> readyable(const GameState& state,
                                               PlayerId controller,
                                               GameObjectId self) {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (id == self) continue;
            if (obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
            if (!obj.is_exhausted) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 855;
        d.def_id = R"RB(ven-068-166)RB";
        d.name = R"RB(Jayce, Brilliant Inventor)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-068/166)RB";
        d.collector_number = 68;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Mind};
        d.energy_cost = 6;
        d.power_cost = 1;
        d.might = 6;
        d.rarity = Rarity::Epic;
        d.ability_text = R"RB(When you play me or the first time you play a non-token gear each turn, you may ready something besides me that's exhausted.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-068-166-6fc33edc896fb713.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_855(CardRegistry& r) {
    r.registerCard(855, std::make_unique<JayceBrilliantInventor>());
}

} // namespace riftbound
