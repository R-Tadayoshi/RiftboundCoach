#include "cards/card_helpers.h"
#include "cards/units/weaponmaster_base.h"

namespace riftbound {
namespace {

/// Riven, Shattered (VEN-041/166)
///
///   [Weaponmaster]
///   When I attack, choose an enemy unit here. Deal 2 to it for each
///   Equipment attached to me.
///
/// Two triggers on one card, and the first is the base class's:
/// WeaponmasterUnit implements [Weaponmaster] as a WhenYouPlayMe trigger. So
/// Riven registers BOTH trigger types and dispatches on ctx.firing_trigger,
/// handing the play case straight back to the base. Overriding
/// triggerType() instead — the obvious move — would silently replace the
/// [Weaponmaster] equip with the attack ability, and the card would look
/// like it worked.
///
/// "For each Equipment attached to me" counts attachments tagged Equipment,
/// not all attachments: a non-Equipment gear attached by some other effect
/// adds nothing. With none attached the damage is zero, so the trigger does
/// nothing rather than dealing a base 2 — the card has no base damage.
class RivenShattered : public WeaponmasterUnit {
public:
    const CardDef& def() const override { return def_; }

    std::vector<TriggerType> triggerTypes() const override {
        return {TriggerType::WhenYouPlayMe, TriggerType::WhenIAttack};
    }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        if (ctx.firing_trigger != TriggerType::WhenIAttack) {
            WeaponmasterUnit::onTrigger(ctx, targets);   // the [Weaponmaster] equip
            return;
        }
        if (!ctx.state.objectExists(ctx.source)) return;

        const int equipment = equipmentOn(ctx.state, ctx.source);
        if (equipment == 0) {
            ctx.events.logTrace("RIVEN, SHATTERED: no Equipment attached — no damage");
            return;
        }

        auto legal = enemiesHere(ctx.state, ctx.controller, ctx.source);
        if (legal.empty()) return;
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else picked = pickTarget(ctx, "Riven, Shattered: an enemy unit here", legal);
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;

        const int amount = 2 * equipment;
        ctx.executor.dealDamage(picked, amount, ctx.source);
        ctx.events.logTrace("RIVEN, SHATTERED: dealt " + std::to_string(amount) +
                             " (2 x " + std::to_string(equipment) + " Equipment)");
        if (ctx.state.objectExists(picked) &&
            ctx.state.getObject(picked).hasLethalDamage()) {
            ctx.executor.killObject(picked);
        }
    }

private:
    static int equipmentOn(const GameState& state, GameObjectId self) {
        int n = 0;
        for (auto id : state.getObject(self).attachments) {
            if (!state.objectExists(id)) continue;
            for (const auto& tag : state.getObject(id).tags) {
                if (tag == "Equipment") { ++n; break; }
            }
        }
        return n;
    }

    static std::vector<GameObjectId> enemiesHere(const GameState& state,
                                                 PlayerId controller,
                                                 GameObjectId self) {
        std::vector<GameObjectId> out;
        const auto here = state.getObject(self).battlefieldId();
        if (!here) return out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || obj.controller == controller) continue;
            if (obj.untargetable_by_enemy) continue;
            auto bf = obj.battlefieldId();
            if (!bf || *bf != *here) continue;
            out.push_back(id);
        }
        return out;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 958;
        d.def_id = R"RB(ven-171-166)RB";
        d.name = R"RB(Riven, Shattered)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-171/166)RB";
        d.collector_number = 171;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 3;
        d.power_cost = 1;
        d.might = 3;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Weaponmaster);
        d.ability_text = R"RB([Weaponmaster]When I attack, choose an enemy unit here. Deal 2 to it for each Equipment attached to me.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-171-166-b29a965405611cc5.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_958(CardRegistry& r) {
    r.registerCard(958, std::make_unique<RivenShattered>());
}

} // namespace riftbound
