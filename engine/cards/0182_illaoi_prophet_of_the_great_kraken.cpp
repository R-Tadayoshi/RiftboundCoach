#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Illaoi, Prophet of the Great Kraken (VEN-182/166)
///
///   When you play me or when I score, play a 1 [M] Tentacle unit token
///   from Bilgewater.
///   I have +1 [M] for each token unit you control.
///
/// The two halves compound: every Tentacle makes Illaoi bigger, and a bigger
/// Illaoi scores more easily, which makes another Tentacle. That is the
/// card, and it only works if the buff counts tokens CONTINUOUSLY rather
/// than being added once per token created — a unit dying has to shrink her
/// again, which an on-create bump would never do.
///
/// So the buff is a self-aura recomputed every pass, and it counts token
/// units the controller has ANYWHERE on the board, not only at Illaoi's
/// battlefield: the text says "you control", with no location clause.
///
/// "When I score" uses WhenYouScoreHere, the closest trigger the engine has.
/// It fires on scoring at Illaoi's battlefield, which is where she scores —
/// but it would also fire on a teammate scoring there, which is broader than
/// printed. Said plainly rather than left to look exact; a tighter reading
/// needs a score trigger scoped to the scoring unit, which does not exist.
class IllaoiProphetOfTheGreatKraken : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<TriggerType> triggerTypes() const override {
        return {TriggerType::WhenYouPlayMe, TriggerType::WhenYouScoreHere};
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        LocationId loc{BaseLocation{ctx.controller}};
        ctx.executor.createToken(ctx.controller, CardType::Unit, "Tentacle",
                                  1, {"Tentacle"}, KeywordSet{}, loc,
                                  /*enter_ready=*/false);
        ctx.events.logTrace("ILLAOI, PROPHET OF THE GREAT KRAKEN: 1[M] Tentacle token");
    }

    void applyPassiveAura(GameState& state, PlayerId controller,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        auto& me = state.getObject(self);
        if (!me.location.has_value()) return;

        int tokens = 0;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || !obj.isToken()) continue;
            if (obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
            ++tokens;
        }
        if (tokens == 0) return;

        GameObject::AuraEffect ae;
        ae.source = self;
        ae.might_bonus = tokens;
        me.aura_effects.push_back(ae);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 969;
        d.def_id = R"RB(ven-182-166)RB";
        d.name = R"RB(Illaoi, Prophet of the Great Kraken)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-182/166)RB";
        d.collector_number = 182;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Chaos};
        d.energy_cost = 6;
        d.might = 4;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB(When you play me or when I score, play a :rb_energy_1: :rb_might: Tentacle unit token from Bilgewater.I have +1 :rb_might: for each token unit you control.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-182-166-a7298c50d8d2ff1c.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_969(CardRegistry& r) {
    r.registerCard(969, std::make_unique<IllaoiProphetOfTheGreatKraken>());
}

} // namespace riftbound
