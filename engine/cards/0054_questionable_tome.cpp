#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Questionable Tome (VEN-054/166)
///
///   [Empower] — [E]   (Pay the cost: Empower me. Use only if not Empowered.)
///   Disempower this, [1], [E]: Draw 1.
///
/// The canonical two-ability Empower shape, and the reason the per-object,
/// per-ability activation gate exists: both abilities cost [E], so only one
/// can ever be used per ready cycle, and each is legal in exactly the state
/// the other is not. A card-wide "use only if …" gate would turn the whole
/// card off in one of those states.
///
/// So this is a rechargeable cantrip: a turn spent winding it up, a turn
/// spent drawing. Disempower is part of the COST of ability 1, so it happens
/// whether or not anything is drawn.
class QuestionableTome : public GearCard {
public:
    const CardDef& def() const override { return def_; }

    std::vector<ActivatedAbility> activatedAbilities() const override {
        return {
            empowerAbility({.exhaust = true}),                      // 0
            ActivatedAbility{.cost = {.exhaust = true, .energy = 1}},  // 1
        };
    }

    bool canActivateAbility(const GameState& state, PlayerId /*controller*/,
                            GameObjectId self, int ability_index) const override {
        return empowerGate(state, self, ability_index, /*empower_index=*/0,
                           /*requires_empowered=*/{1});
    }

    void onActivate(CardContext& ctx, int ability_index,
                    const std::vector<GameObjectId>&) override {
        if (ability_index == 0) {
            empowerObject(ctx, ctx.source);
            return;
        }
        disempowerObject(ctx, ctx.source);   // part of the cost
        ctx.executor.drawCards(ctx.controller, 1);
        ctx.events.logTrace("QUESTIONABLE TOME: disempowered -> draw 1");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 841;
        d.def_id = R"RB(ven-054-166)RB";
        d.name = R"RB(Questionable Tome)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-054/166)RB";
        d.collector_number = 54;
        d.card_type = CardType::Gear;
        d.domains = {Domain::Mind};
        d.energy_cost = 3;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB([Empower] —  :rb_exhaust: (Pay the cost: Empower me. Use only if not Empowered.)Disempower this, :rb_energy_1:, :rb_exhaust:: Draw 1.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-054-166-f91aee7fcc0570f6.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_841(CardRegistry& r) {
    r.registerCard(841, std::make_unique<QuestionableTome>());
}

} // namespace riftbound
