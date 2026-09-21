#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Ol' Poro (VEN-029/166)
///
///   I can't be played on your first, second, or third turns.
///
/// A 2-cost 4-Might body, which is well above rate — the restriction is the
/// price. Implemented through the NARROWING hook
/// (restrictsPlayLocations + getPlayLocations), whose own comment says an
/// empty list means unplayable. That is exactly this card: before the fourth
/// turn it offers no locations and so generates no Play action at all.
///
/// Because the hook suppresses the engine's default base + battlefield
/// plays entirely, the allowed case has to rebuild them — and rebuilding
/// them is where this goes wrong quietly. It mirrors the default loop
/// including blocks_unit_play (Rockfall Path) and units_play_base_only
/// (Mageseeker Warden); miss either and Ol' Poro becomes the one unit in
/// the game that ignores them.
///
/// "Your first, second, or third TURNS" counts the controller's own turns
/// taken, not the turn number — the player going second reaches their third
/// turn later in absolute terms, and the card is about their turns.
class OlPoro : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    bool restrictsPlayLocations() const override { return true; }

    std::vector<LocationId> getPlayLocations(const GameState& state,
                                             PlayerId player) const override {
        const auto& ps = state.player(player);
        if (ps.turns_taken < 3) return {};   // unplayable — the whole card

        std::vector<LocationId> out;
        out.push_back(BaseLocation{player});          // CR 355.2.a
        if (ps.units_play_base_only) return out;      // Mageseeker Warden

        for (const auto& bf : state.battlefields) {
            if (bf.blocks_unit_play) continue;        // Rockfall Path
            if (!bf.controller.has_value() || *bf.controller != player) continue;
            out.push_back(BattlefieldLocation{bf.id});
        }
        return out;
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 816;
        d.def_id = R"RB(ven-029-166)RB";
        d.name = R"RB(Ol' Poro)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-029/166)RB";
        d.collector_number = 29;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 2;
        d.might = 4;
        d.rarity = Rarity::Common;
        d.ability_text = R"RB(I can't be played on your first, second, or third turns.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-029-166-091603af5076943c.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_816(CardRegistry& r) {
    r.registerCard(816, std::make_unique<OlPoro>());
}

} // namespace riftbound
