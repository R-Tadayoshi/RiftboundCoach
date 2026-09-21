#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Gust Monk (VEN-101/166)
///
///   You may pay [1] as an additional cost to play me.
///   When you play me, if you paid the additional cost, banish a card from
///   any trash to give a unit [Assault 2] this turn.
///
/// The generated stub carried Assault 2 on the CardDef. Gust Monk does not
/// HAVE Assault — it GRANTS it, to any unit, and only when the extra [1] was
/// paid. Left there, a 2-cost 2-Might body attacks as a 4 every turn for
/// free. Fifth instance of that artifact family.
///
/// "From ANY trash" includes the opponent's, which is most of the point:
/// banishing the card they were planning to Flow back is often worth more
/// than the +2 Might. So the banish list spans both trashes.
///
/// Two picks — the card to banish, then the unit to buff — so pickTargetPair
/// rather than two pickTargets, which a single card cannot do.
class GustMonk : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    OptionalAdditionalCost optionalAdditionalCost() const override {
        OptionalAdditionalCost c;
        c.valid = true;
        c.energy = 1;
        c.paid_flag = "gust_monk_paid";
        return c;
    }

    TriggerType triggerType() const override { return TriggerType::WhenYouPlayMe; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        auto& self = ctx.state.getObject(ctx.source);
        auto it = self.card_counters.find("gust_monk_paid");
        if (it == self.card_counters.end() || it->second == 0) return;

        auto fodder = trashCards(ctx.state);
        if (fodder.empty()) {
            ctx.events.logTrace("GUST MONK: no card in any trash to banish");
            return;
        }

        const PlayerId me = ctx.controller;
        GameState& st = ctx.state;
        auto pair = pickTargetPair(
            ctx, "Gust Monk: banish a card from any trash, then buff a unit",
            fodder,
            [&st, me](GameObjectId /*banished*/) { return anyUnit(st, me); });
        const auto banished = pair.first;
        const auto unit = pair.second;
        if (banished == kInvalidId || unit == kInvalidId) return;
        if (!ctx.state.objectExists(banished) || !ctx.state.objectExists(unit)) return;

        ctx.executor.banishObject(banished);
        ctx.executor.giveTemporaryKeyword(unit, Keyword::Assault, 2);
        ctx.events.logTrace("GUST MONK: banished a trash card -> [Assault 2] to " +
                             ctx.state.getObject(unit).name);
    }

private:
    /// Both trashes. Banishing the opponent's Flow card is often the point.
    static std::vector<GameObjectId> trashCards(const GameState& state) {
        std::vector<GameObjectId> out;
        for (auto p : {PlayerId::Player1, PlayerId::Player2}) {
            for (auto id : state.player(p).trash) {
                if (state.objectExists(id)) out.push_back(id);
            }
        }
        return out;
    }

    static std::vector<GameObjectId> anyUnit(const GameState& state, PlayerId controller) {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || !obj.location.has_value()) continue;
            if (obj.controller != controller && obj.untargetable_by_enemy) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 888;
        d.def_id = R"RB(ven-101-166)RB";
        d.name = R"RB(Gust Monk)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-101/166)RB";
        d.collector_number = 101;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Chaos};
        d.energy_cost = 2;
        d.might = 2;
        d.rarity = Rarity::Uncommon;
        // NOT keywords.set(Assault) — Gust Monk GRANTS Assault, it has none.
        d.ability_text = R"RB(You may pay :rb_energy_1: as an additional cost to play me.When you play me, if you paid the additional cost, banish a card from any trash to give a unit [Assault 2] this turn. (+2 :rb_might: while it's an attacker.))RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-101-166-338f22b21fb0f05c.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_888(CardRegistry& r) {
    r.registerCard(888, std::make_unique<GustMonk>());
}

} // namespace riftbound
