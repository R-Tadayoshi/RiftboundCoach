#include "cards/card.h"
#include "cards/card_registry.h"
#include "core/game_state.h"
#include "core/events.h"
#include "engine/effect_executor.h"
#include <string>
#include <memory>
#include <vector>

namespace riftbound {
namespace {

/// Jayce, Hammer in Hand (VEN-088/166)
///
///   When I become ready, choose one to give me this turn —[Assault 2] (+2 :rb_might: while I'm an attacker.)[Deflect 2] (Opponents must pay :rb_rune_rainbow::rb_rune_rainbow: to choose me with a spell or ability.)[Ganking] (I can move from battlefield to battlefield.)
class JayceHammerInHand : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    // "When I become ready, choose one to give me this turn — [Assault 2] /
    // [Deflect 2] / [Ganking]." A modal choice with no target: the unit is
    // always me, only the keyword varies.
    TriggerType triggerType() const override { return TriggerType::WhenIAmReadied; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        const int mode = pickMode(ctx, "Jayce, Hammer in Hand: choose one", 3,
                                  {"[Assault 2]", "[Deflect 2]", "[Ganking]"});
        switch (mode) {
            case 0: ctx.executor.giveTemporaryKeyword(ctx.source, Keyword::Assault, 2); break;
            case 1: ctx.executor.giveTemporaryKeyword(ctx.source, Keyword::Deflect, 2); break;
            case 2: ctx.executor.giveTemporaryKeyword(ctx.source, Keyword::Ganking, 1); break;
            default: return;   // no choice made (suspend or fizzle)
        }
        ctx.events.logTrace("JAYCE HAMMER IN HAND: readied -> mode " + std::to_string(mode));
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 875;
        d.def_id = R"RB(ven-088-166)RB";
        d.name = R"RB(Jayce, Hammer in Hand)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-088/166)RB";
        d.collector_number = 88;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Body};
        d.energy_cost = 4;
        d.power_cost = 1;
        d.might = 5;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Assault);
        d.keywords.set(Keyword::Deflect);
        d.keywords.set(Keyword::Ganking);
        d.assault_value = 2;
        d.deflect_value = 2;
        d.ability_text = R"RB(When I become ready, choose one to give me this turn —[Assault 2] (+2 :rb_might: while I'm an attacker.)[Deflect 2] (Opponents must pay :rb_rune_rainbow::rb_rune_rainbow: to choose me with a spell or ability.)[Ganking] (I can move from battlefield to battlefield.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-088-166-0cfb4ef5904496e5.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_875(CardRegistry& r) {
    r.registerCard(875, std::make_unique<JayceHammerInHand>());
}

} // namespace riftbound
