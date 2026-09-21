#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Decree of Focus (VEN-040/166)
///
///   [Reaction] Choose a friendly unit that's in combat with an enemy Fury
///   unit or that's being chosen by an enemy Fury spell. Give it +4 [M] this
///   turn.
///
/// +4 for [1] is enormous, and the two conditions are what pay for it. Both
/// have to be checked, and only one of them is easy.
///
/// "In combat with an enemy Fury unit" reads off the board: a friendly unit
/// with a combat designation, at a battlefield where an enemy Fury unit also
/// has one.
///
/// "Being chosen by an enemy Fury spell" reads off the CHAIN, which is the
/// half that makes this a Reaction at all — you play it in response to the
/// spell, while that spell is still an item waiting to resolve. So it scans
/// chain items controlled by the opponent whose CardDef carries Domain::Fury
/// and whose targets include the unit.
///
/// Checking only the combat half would leave a card that works in fights and
/// silently does nothing against removal, which is half the reason it is in
/// a deck.
class DecreeOfFocus : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    bool isReactionAbility() const override { return true; }
    bool needsPlayTimeTarget() const override { return true; }

    TargetRequirements getTargetRequirements() const override {
        return {.count = 1, .must_be_unit = true, .must_be_friendly = true};
    }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || obj.controller != controller) continue;
            if (!obj.location.has_value()) continue;
            if (inCombatWithEnemyFury(state, id, obj, controller) ||
                chosenByEnemyFurySpell(state, id, controller)) {
                out.push_back(id);
            }
        }
        return out;
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller).empty();
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        auto legal = enumerateLegalTargets(ctx.state, ctx.controller);
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) {
            // Re-checked: the enemy spell may already have resolved or been
            // countered, and the combat may be over.
            for (auto id : legal) if (id == targets[0]) picked = id;
            if (picked == kInvalidId) {
                ctx.events.logTrace("DECREE OF FOCUS: target no longer qualifies");
                return;
            }
        } else {
            if (legal.empty()) return;
            picked = pickTarget(ctx, "Decree of Focus: a friendly unit under threat", legal);
        }
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        ctx.executor.giveTemporaryMight(picked, 4);
        ctx.events.logTrace("DECREE OF FOCUS: +4[M] this turn -> " +
                             ctx.state.getObject(picked).name);
    }

private:
    static bool isFury(const std::vector<Domain>& domains) {
        for (auto d : domains) if (d == Domain::Fury) return true;
        return false;
    }

    static bool inCombatWithEnemyFury(const GameState& state, GameObjectId self,
                                      const GameObject& me, PlayerId controller) {
        if (me.combat_designation == CombatDesignation::None) return false;
        const auto here = me.battlefieldId();
        if (!here) return false;
        for (auto& [id, obj] : state.objects) {
            if (id == self) continue;
            if (!obj.isUnit() || obj.controller == controller) continue;
            if (obj.combat_designation == CombatDesignation::None) continue;
            if (!isFury(obj.domains)) continue;
            auto bf = obj.battlefieldId();
            if (!bf || *bf != *here) continue;
            return true;
        }
        return false;
    }

    /// The Reaction half: an enemy Fury spell on the chain that names this
    /// unit among its targets.
    static bool chosenByEnemyFurySpell(const GameState& state, GameObjectId self,
                                       PlayerId controller) {
        for (const auto& item : state.chain.items) {
            if (!item.is_spell) continue;
            if (item.controller == controller) continue;
            if (item.card_def_id == kInvalidId) continue;
            bool names_me = false;
            for (auto t : item.targets) if (t == self) { names_me = true; break; }
            if (!names_me) continue;
            if (!state.objectExists(item.source)) continue;
            if (isFury(state.getObject(item.source).domains)) return true;
        }
        return false;
    }

    const CardDef def_ = [] {
        CardDef d;
        d.id = 827;
        d.def_id = R"RB(ven-040-166)RB";
        d.name = R"RB(Decree of Focus)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-040/166)RB";
        d.collector_number = 40;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Calm};
        d.energy_cost = 1;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Reaction);
        d.ability_text = R"RB([Reaction] (Play any time, even before spells and abilities resolve.)Choose a friendly unit that's in combat with an enemy Fury (:rb_rune_fury:) unit or that's being chosen by an enemy Fury spell. Give it +4 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-040-166-11a576db48aef9fb.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_827(CardRegistry& r) {
    r.registerCard(827, std::make_unique<DecreeOfFocus>());
}

} // namespace riftbound
