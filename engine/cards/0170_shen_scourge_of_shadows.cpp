#include "cards/card_helpers.h"

namespace riftbound {
namespace {

/// Shen, Scourge of Shadows (VEN-042/166)
///
///   When I hold, if there is exactly one other unit you control here,
///   draw 1.
///
/// "Exactly one OTHER" is the whole condition and it is easy to write as
/// "at least one": a pair draws, a crowd does not. The card rewards holding
/// with a specific shape of board rather than with a big one, and reading it
/// loosely would make it draw on almost every hold.
///
/// "Here" is Shen's own battlefield. A hold happens at a battlefield, so if
/// he somehow has no battlefield location there is nothing to count and the
/// trigger does nothing rather than counting the whole board.
class ShenScourgeOfShadows : public UnitCard {
public:
    const CardDef& def() const override { return def_; }

    TriggerType triggerType() const override { return TriggerType::WhenIHold; }

    void onTrigger(CardContext& ctx, const std::vector<GameObjectId>&) override {
        if (!ctx.state.objectExists(ctx.source)) return;
        const auto here = ctx.state.getObject(ctx.source).battlefieldId();
        if (!here) return;

        int others = 0;
        for (auto& [id, obj] : ctx.state.objects) {
            if (id == ctx.source) continue;              // "other"
            if (!obj.isUnit()) continue;
            if (obj.controller != ctx.controller) continue;
            auto bf = obj.battlefieldId();
            if (!bf || *bf != *here) continue;
            ++others;
        }
        if (others != 1) {
            ctx.events.logTrace("SHEN, SCOURGE OF SHADOWS: " +
                                 std::to_string(others) +
                                 " other friendly units here — needs exactly 1");
            return;
        }
        ctx.executor.drawCards(ctx.controller, 1);
        ctx.events.logTrace("SHEN, SCOURGE OF SHADOWS: hold with exactly one ally -> draw 1");
    }

private:
    const CardDef def_ = [] {
        CardDef d;
        d.id = 957;
        d.def_id = R"RB(ven-170-166)RB";
        d.name = R"RB(Shen, Scourge of Shadows)RB";
        d.set_code = R"RB(VEN)RB";
        d.set_name = R"RB(VEN)RB";
        d.public_code = R"RB(VEN-170/166)RB";
        d.collector_number = 170;
        d.card_type = CardType::Unit;
        d.domains = {Domain::Calm};
        d.energy_cost = 5;
        d.power_cost = 1;
        d.might = 6;
        d.rarity = Rarity::Rare;
        d.ability_text = R"RB(When I hold, if there is exactly one other unit you control here, draw 1.)RB";
        d.image_url = R"RB(https://cdn.riftscribe.gg/cards/originals/ven-170-166-e1e24d335f7e31e4.png)RB";
        return d;
    }();
};

}  // anonymous namespace

void register_card_957(CardRegistry& r) {
    r.registerCard(957, std::make_unique<ShenScourgeOfShadows>());
}

} // namespace riftbound
