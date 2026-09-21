#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Up from the Deep (VEN-100/166)
///
///   Play two 1 [M] Tentacle unit tokens from Bilgewater.
///   [Flow] [3]
///
/// "from Bilgewater" is flavour for where the tokens come from, not a zone
/// the engine has — tokens are created, not drawn from anywhere.
///
/// They enter at the controller's base and exhausted, which is the engine's
/// default for a unit entering play (CR 143.4). Nothing on the card says
/// otherwise, and making them enter ready would hand the search two free
/// blockers the card does not promise.
class UpFromTheDeep : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    FlowCost flowCost() const override {
        return {.valid = true, .energy = 3};
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>&) override {
        LocationId loc{BaseLocation{ctx.controller}};
        for (int i = 0; i < 2; ++i) {
            ctx.executor.createToken(ctx.controller, CardType::Unit, "Tentacle",
                                      1, {"Tentacle"}, KeywordSet{}, loc,
                                      /*enter_ready=*/false);
        }
        ctx.events.logTrace("UP FROM THE DEEP: two 1[M] Tentacle tokens at base");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 887;
        d.def_id = R"RB(ven-100-166)RB";
        d.name = R"RB(Up from the Deep)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-100/166)RB";
        d.collector_number = 100;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Chaos};
        d.energy_cost = 3;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(Play two 1 :rb_might: Tentacle unit tokens from Bilgewater.[Flow] :rb_energy_3: (You may play this from your trash for its Flow cost. Then banish it.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-100-166-27fe093f57bbd337.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_887(CardRegistry& r) {
    r.registerCard(887, std::make_unique<UpFromTheDeep>());
}

} // namespace riftbound
