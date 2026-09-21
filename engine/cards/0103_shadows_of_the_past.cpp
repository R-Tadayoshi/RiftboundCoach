#include "cards/card_helpers.h"

#include <algorithm>
#include <optional>
#include <vector>

namespace riftbound {
namespace {

/// Shadows of the Past (VEN-103/166)
///
///   Return up to 2 units from trashes to their owners' hands.
///
/// "TRASHES", plural — either player's. Returning an opponent's unit to
/// their hand looks like a gift and sometimes is not: it is the only way
/// this card answers something they were about to Flow back or reanimate.
/// So both trashes are offered and the search can decide.
///
/// "UP TO 2" is the reason this card waited for pickTargets: pickTarget
/// reserves a fixed set of resume points and cannot be called twice, and
/// picking one then guessing the second is a different card. The optional
/// flag puts a stop option on every prompt, the first included, so zero is
/// a legal answer — which it has to be, since one of the units on offer may
/// be the opponent's.
///
/// A returned unit leaves the trash. The pick list excludes anything
/// already chosen, which legal_fn gets for free — it is handed the picks so
/// far before every prompt.
///
/// Tokens are not offered: CR 183.1 has a token cease to exist the moment
/// it leaves the board, so one cannot be sitting in a trash waiting to come
/// back. Filtering here rather than trusting the trash to be clean.
///
/// No target requirement and no hasLegalTargets override, deliberately.
/// "Up to 2" with two empty trashes returns nothing, and a spell that can
/// do nothing is still legal to play — declaring it unplayable would be the
/// checker teaching the player a rule the game does not have.
class ShadowsOfThePast : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>&) override {
        GameState& st = ctx.state;
        auto picks = pickTargets(
            ctx, "Shadows of the Past: return up to 2 units from trashes",
            [&st](const std::vector<GameObjectId>& so_far) {
                return unitsInTrashes(st, so_far);
            },
            /*max_count=*/2, /*optional=*/true);
        if (!picks.has_value()) return;   // suspended — MUST return

        for (auto id : *picks) {
            if (!ctx.state.objectExists(id)) continue;
            auto& obj = ctx.state.getObject(id);
            auto& trash = ctx.state.player(obj.owner).trash;
            trash.erase(std::remove(trash.begin(), trash.end(), id), trash.end());
            obj.zone = ZoneType::Hand;
            obj.location = std::nullopt;
            obj.damage_marked = 0;
            obj.is_exhausted = false;
            ctx.state.player(obj.owner).hand.push_back(id);
            ctx.events.logTrace("SHADOWS OF THE PAST: returned " + obj.name +
                                 " to its owner's hand");
        }
    }

private:
    static std::vector<GameObjectId> unitsInTrashes(
        const GameState& state, const std::vector<GameObjectId>& exclude) {
        std::vector<GameObjectId> out;
        for (auto p : {PlayerId::Player1, PlayerId::Player2}) {
            for (auto id : state.player(p).trash) {
                if (!state.objectExists(id)) continue;
                const auto& obj = state.getObject(id);
                if (!obj.isUnit()) continue;
                if (obj.super_type == SuperType::Token) continue;
                bool taken = false;
                for (auto e : exclude) if (e == id) { taken = true; break; }
                if (taken) continue;
                out.push_back(id);
            }
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 890;
        d.def_id = R"RB(ven-103-166)RB";
        d.name = R"RB(Shadows of the Past)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-103/166)RB";
        d.collector_number = 103;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Chaos};
        d.energy_cost = 3;
        d.power_cost = 1;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(Return up to 2 units from trashes to their owners' hands.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-103-166-2015115f433e21b6.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_890(CardRegistry& r) {
    r.registerCard(890, std::make_unique<ShadowsOfThePast>());
}

} // namespace riftbound
