#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Sandstone Chimera (VEN-036/166)
///
///   While I'm at a battlefield, players only channel 1 rune at the start of
///   their Channel Phase.
///
/// "PLAYERS", not "your opponent". The lock is symmetrical — it slows the
/// Chimera's own controller exactly as much — and reading it one-sidedly
/// would make a 7-cost 8-Might body into a far better card than the one
/// printed. So the flag goes on both players.
///
/// "While I'm AT A BATTLEFIELD" is the other half: a Chimera sitting in its
/// base does nothing. The aura is re-asserted on every recalculateAuras, so
/// moving it home or killing it lifts the lock without anything having to
/// remember to undo it.
class SandstoneChimera : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    void applyPassiveAura(GameState& state, PlayerId /*controller*/,
                          GameObjectId self) const override {
        if (!state.objectExists(self)) return;
        if (!state.getObject(self).isAtBattlefield()) return;
        for (auto p : {PlayerId::Player1, PlayerId::Player2}) {
            state.player(p).channel_capped_to_one = true;
        }
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 823;
        d.def_id = R"RB(ven-036-166)RB";
        d.name = R"RB(Sandstone Chimera)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-036/166)RB";
        d.collector_number = 36;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 7;
        d.power_cost = 2;
        d.might = 8;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(While I'm at a battlefield, players only channel 1 rune at the start of their Channel Phase.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-036-166-d3f0334c98470d0a.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_823(CardRegistry& r) {
    r.registerCard(823, std::make_unique<SandstoneChimera>());
}

} // namespace riftbound
