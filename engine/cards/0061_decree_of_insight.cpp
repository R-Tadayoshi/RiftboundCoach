#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Decree of Insight (VEN-061/166)
///
///   [Reaction] Ignore [Deflect] while paying this spell's cost.
///   Give an enemy Body unit -5 [M] this turn.
///
/// The [Deflect] clause is currently inert, and saying so is the honest
/// thing: the engine does not charge the Deflect tax anywhere.
/// deflect_value is rendered and fed to the feature extractor and never read
/// at targeting time, so there is no cost to ignore. The card is therefore
/// complete as written — not PARTIAL — and will become strictly more correct
/// the day Deflect is charged, without this file changing.
///
/// -5 is enormous for [1], and the Body restriction is what pays for it.
/// Minimum 0 rather than negative Might.
class DecreeOfInsight : public SpellCard {
public:
    const CardDef& def() const override { return def_; }

    bool isReactionAbility() const override { return true; }
    bool needsPlayTimeTarget() const override { return true; }

    TargetRequirements getTargetRequirements() const override {
        return {.count = 1, .must_be_unit = true, .must_be_enemy = true};
    }

    std::vector<GameObjectId> enumerateLegalTargets(const GameState& state,
                                                    PlayerId controller) const override {
        std::vector<GameObjectId> out;
        for (auto& [id, obj] : state.objects) {
            if (!obj.isUnit() || obj.controller == controller) continue;
            if (!obj.location.has_value()) continue;
            if (obj.untargetable_by_enemy) continue;
            bool body = false;
            for (auto d : obj.domains) if (d == Domain::Body) { body = true; break; }
            if (!body) continue;
            out.push_back(id);
        }
        return out;
    }

    bool hasLegalTargets(const GameState& state, PlayerId controller) const override {
        return !enumerateLegalTargets(state, controller).empty();
    }

    void onResolve(CardContext& ctx, const std::vector<GameObjectId>& targets) override {
        GameObjectId picked = kInvalidId;
        if (!targets.empty()) picked = targets[0];
        else picked = pickTarget(ctx, "Decree of Insight: an enemy Body unit",
                                 enumerateLegalTargets(ctx.state, ctx.controller));
        if (picked == kInvalidId || !ctx.state.objectExists(picked)) return;
        ctx.executor.giveTemporaryMight(picked, -5, /*minimum=*/0);
        ctx.events.logTrace("DECREE OF INSIGHT: -5[M] this turn -> " +
                             ctx.state.getObject(picked).name);
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 848;
        d.def_id = R"RB(ven-061-166)RB";
        d.name = R"RB(Decree of Insight)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-061/166)RB";
        d.collector_number = 61;
        d.card_type = CardType::Spell;
        d.domains = {Domain::Mind};
        d.energy_cost = 1;
        d.rarity = Rarity::Rare;
        d.keywords.set(Keyword::Reaction);
        // NOT keywords.set(Deflect) — the card IGNORES Deflect, it has none.
        // Same generator artifact as Dune Surfer and [Tank].
        d.ability_text = R"RB([Reaction] (Play any time, even before spells and abilities resolve.)Ignore [Deflect] while paying this spell's cost.Give an enemy Body (:rb_rune_body:) unit -5 :rb_might: this turn.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-061-166-f398578602537a91.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_848(CardRegistry& r) {
    r.registerCard(848, std::make_unique<DecreeOfInsight>());
}

} // namespace riftbound
