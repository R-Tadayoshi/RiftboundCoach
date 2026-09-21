#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Threshold of the Gray (VEN-166/166)
///
///   When combat starts here, the attacker and defender each [Add] [1].
///
/// Symmetrical, which is the whole character of the card: it pays the
/// defender too, so attacking into it hands your opponent a rune's worth of
/// energy mid-combat. A reading that paid only the controller would make it
/// a straightforwardly good battlefield instead of a double-edged one, and
/// nothing about the resulting game would look wrong.
///
/// Both players come from card_counters, captured by the trigger manager:
/// the trigger carries a single controller, and a card that affects "the
/// attacker AND defender" needs both. Same device the defender path already
/// uses to capture the attacking unit.
///
/// [Add] is floating energy for this combat, not a channelled rune — it
/// expires, which is what makes a mid-combat payment matter at all.
class ThresholdOfTheGray : public BattlefieldCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override {
        return TriggerType::WhenCombatStartsHere;
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        auto& self = ctx.state.getObject(ctx.source);

        auto read = [&self](const char* key) -> PlayerId {
            auto it = self.card_counters.find(key);
            if (it == self.card_counters.end()) return PlayerId::None;
            return static_cast<PlayerId>(it->second);
        };
        const PlayerId attacker = read("__combat_attacker");
        const PlayerId defender = read("__combat_defender");

        for (auto p : {attacker, defender}) {
            if (p == PlayerId::None) continue;
            ctx.executor.addFloatingEnergy(p, 1);
        }
        ctx.events.logTrace("THRESHOLD OF THE GRAY: attacker and defender each add [1]");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 953;
        d.def_id = R"RB(ven-166-166)RB";
        d.name = R"RB(Threshold of the Gray)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-166/166)RB";
        d.collector_number = 166;
        d.card_type = CardType::Battlefield;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(When combat starts here, the attacker and defender each [Add] :rb_energy_1:.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-166-166-2afa8e7322ef27eb.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_953(CardRegistry& r) {
    r.registerCard(953, std::make_unique<ThresholdOfTheGray>());
}

} // namespace riftbound
