#include "cards/card_helpers.h"

#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Noxian Emissary (VEN-128/166)
///
///   [Empower] [1][Order]
///   [Empowered][>][>>][Deathknell][>] Play two 1 [M] Recruit unit tokens to
///   your base. (When I die while Empowered, get the effect.)
///
/// Same gate as Baccai Witherclaw: the latch is read when the unit DIES.
/// An Emissary disempowered before it dies leaves nothing behind, which is
/// what makes disempowering it worth a card.
///
/// TWO TOKENS, TO YOUR BASE. Not to where it died — the text says base, and
/// a Deathknell that replaced a battlefield presence with two bodies at that
/// battlefield would be a considerably better card in a contest.
///
/// The tokens enter EXHAUSTED (`enter_ready = false`), which is the default
/// for anything played without [Accelerate]. They are named Recruit and
/// tagged Recruit so anything that counts them by name or tag can.
class NoxianEmissary : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {empowerAbility({.energy = 1, .power = 1,
                                .power_domain = Domain::Order})};
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, /*empower_index=*/0, {});
    }

    void onActivate(CardContext& ctx, int ability_index,
                    const std::vector<GameObjectId>&) override {
        if (ability_index == 0) empowerObject(ctx, ctx.source);
    }

    TriggerType triggerType() const override { return TriggerType::WhenIDie; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!isEmpowered(ctx.state, ctx.source)) {
            ctx.events.logTrace("NOXIAN EMISSARY: died without the latch -> "
                                 "no [Deathknell]");
            return;
        }
        for (int i = 0; i < 2; ++i) {
            ctx.executor.createToken(ctx.controller, CardType::Unit, "Recruit",
                                      /*might=*/1, /*tags=*/{"Recruit"}, KeywordSet{},
                                      BaseLocation{ctx.controller},
                                      /*enter_ready=*/false);
        }
        ctx.events.logTrace("NOXIAN EMISSARY: [Deathknell] -> two 1[M] Recruits "
                             "to base");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 915;
        d.def_id = R"RB(ven-128-166)RB";
        d.name = R"RB(Noxian Emissary)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-128/166)RB";
        d.collector_number = 128;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Order};
        d.energy_cost = 2;
        d.might = 2;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB([Empower] :rb_energy_1::rb_rune_order: (:rb_energy_1::rb_rune_order:: Empower me. Use only if not Empowered.)[Empowered][>][>>][Deathknell][>] Play two 1 :rb_might: Recruit unit tokens to your base. (When I die while Empowered, get the effect.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-128-166-883915969bb42d12.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_915(CardRegistry& r) {
    r.registerCard(915, std::make_unique<NoxianEmissary>());
}

} // namespace riftbound
