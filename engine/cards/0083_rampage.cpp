#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Rampage (VEN-083/166)
///
///   As you play this, you may pay [Body] as an additional cost.
///   Choose a friendly unit and an enemy unit. If you paid the additional
///   cost, give the friendly unit +2 [M] this turn. They deal damage equal
///   to their Mights to each other.
///
/// A forced fight, and the [Body] buys the two Might that decides who wins
/// it — so the payment is not a rider, it is usually the whole spell.
///
/// The order is printed and it matters: the buff lands BEFORE the exchange,
/// so the +2 counts toward the damage the friendly unit deals as well as
/// what it survives. Applying it afterwards would leave a card that reads
/// the same and trades differently in every close fight.
///
/// Both Mights are read at the moment of the exchange and both blows land —
/// this is simultaneous, so a unit that dies still deals its damage. Killing
/// one first and then asking the other to hit a corpse would silently make
/// Rampage a one-sided removal spell.
class Rampage : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    OptionalAdditionalCost optionalAdditionalCost() const override {
        OptionalAdditionalCost c;
        c.valid = true;
        c.power = 1;
        c.power_domain = Domain::Body;
        c.paid_flag = "rampage_paid";
        return c;
    }

    bool needsPlayTimeTargetPair() const override { return true; }

    TargetRequirements getTargetRequirements() const override {
        return {.count = 2, .must_be_unit = true};
    }

    /// First pick: a friendly unit. Offered only when there is an enemy for
    /// it to fight — a Rampage with nothing opposite resolves into nothing.
    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller) const override {
        if (enemies(state, controller).empty()) return {};
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
            out.push_back(id);
        }
        return out;
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller).empty();
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        GameObjectId mine = kInvalidId, theirs = kInvalidId;
        if (targets.size() >= 2) {
            mine = targets[0];
            theirs = targets[1];
        } else {
            const PlayerId me = ctx.controller;
            GameState& st = ctx.state;
            auto pair = pickTargetPair(
                ctx, "Rampage: a friendly unit, then an enemy",
                enumerateLegalTargets(st, me),
                [&st, me](GameObjectId /*first*/) { return enemies(st, me); });
            mine = pair.first;
            theirs = pair.second;
        }
        if (mine == kInvalidId || theirs == kInvalidId) return;
        if (!ctx.state.objectExists(mine) || !ctx.state.objectExists(theirs)) return;

        bool paid = false;
        if (ctx.state.objectExists(ctx.source)) {
            auto& self = ctx.state.getObject(ctx.source);
            auto it = self.card_counters.find("rampage_paid");
            paid = it != self.card_counters.end() && it->second != 0;
        }
        if (paid) {
            // Before the exchange, as printed — the +2 counts toward what it
            // DEALS, not only what it survives.
            ctx.executor.giveTemporaryMight(mine, 2);
        }

        // Both Mights read before either blow lands: the exchange is
        // simultaneous, so a unit that dies still deals its damage.
        const int my_might = ctx.state.getObject(mine).current_might;
        const int their_might = ctx.state.getObject(theirs).current_might;

        ctx.executor.dealDamage(theirs, my_might, mine);
        ctx.executor.dealDamage(mine, their_might, theirs);
        ctx.events.logTrace("RAMPAGE: " + std::to_string(my_might) + " vs " +
                             std::to_string(their_might) + (paid ? " (paid)" : ""));

        for (auto id : {mine, theirs}) {
            if (ctx.state.objectExists(id) &&
                ctx.state.getObject(id).hasLethalDamage()) {
                ctx.executor.killObject(id);
            }
        }
    }

private:
    static std::vector<GameObjectId> enemies(const GameState& state, PlayerId controller) {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || obj.controller == controller) continue;
            if (!obj.location.has_value()) continue;
            if (obj.untargetable_by_enemy) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 870;
        d.def_id = R"RB(ven-083-166)RB";
        d.name = R"RB(Rampage)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-083/166)RB";
        d.collector_number = 83;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Body};
        d.energy_cost = 3;
        d.rarity = Rarity::Uncommon;
        d.ability_text = R"RB(As you play this, you may pay :rb_rune_body: as an additional cost.Choose a friendly unit and an enemy unit. If you paid the additional cost, give the friendly unit +2 :rb_might: this turn. They deal damage equal to their Mights to each other.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-083-166-90a099bb2332b5e8.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_870(CardRegistry& r) {
    r.registerCard(870, std::make_unique<Rampage>());
}

} // namespace riftbound
