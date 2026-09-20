// Prove the one unproven link: can a board we played be rebuilt inside the
// engine, and will the engine then tell us what is legal from there?
//
// Everything before this was reading. This runs.
//
// Deliberately uses GameEngine directly rather than the OpenSpiel wrapper.
// Search comes later via RiftboundState::makeFromSnapshot (public, and used
// by Clone() on every MCTS decision); what has to be settled first is whether
// an edited GameState is something the engine will resume from at all.

#include "cards/card_registry.h"
#include "core/card_db.h"
#include "core/events.h"
#include "core/game_state.h"
#include "engine/game_engine.h"
#include "io/state_editor.h"
#include "rules/deck_validator.h"

#include <cstdio>
#include <string>

using namespace riftbound;

static const char* stepKindName(StepKind k) {
    switch (k) {
        case StepKind::Done: return "Done";
        case StepKind::NeedDecision: return "NeedDecision";
    }
    return "?";
}

int main(int argc, char** argv) {
    const std::string deck1 = argc > 1 ? argv[1] : "decks/draven_test.txt";
    const std::string deck2 = argc > 2 ? argv[2] : "decks/draven_test.txt";

    CardRegistry registry;
    registry.loadAll();
    CardDB db;
    db.buildFromClasses(registry);
    std::printf("card db built\n");

    auto sub1 = DeckValidator::loadFromDeckList(deck1, db);
    auto sub2 = DeckValidator::loadFromDeckList(deck2, db);
    std::printf("decks loaded: %s / %s\n", deck1.c_str(), deck2.c_str());

    EventBus bus;
    GameEngine engine(db, bus, registry);

    StepResult sr = engine.beginGame(sub1, sub2, /*seed=*/42);
    std::printf("beginGame -> %s, %zu legal action(s)\n",
                stepKindName(sr.kind), sr.legal.size());

    // Walk forward a little so we are past mulligans and into real play,
    // taking the first legal choice each time. Not strategy — just a way to
    // reach a mid-game state worth editing.
    int steps = 0;
    while (sr.kind == StepKind::NeedDecision && steps < 40) {
        sr = engine.applyChoice(0);
        ++steps;
    }
    std::printf("after %d choices -> %s, turn %d, phase %d\n",
                steps, stepKindName(sr.kind),
                engine.state().turn.turn_number,
                static_cast<int>(engine.state().turn.phase));

    if (sr.kind != StepKind::NeedDecision) {
        std::printf("game ended early; nothing to edit\n");
        return 0;
    }

    // --- the actual question: does a god-mode edit survive a resume? ---
    GameState edited = engine.state();
    StateEditor editor;

    const int before_p1 = edited.player(PlayerId::Player1).score;
    auto r = editor.setPlayerScore(edited, PlayerId::Player1, 5);
    std::printf("setPlayerScore(P1, 5): %s%s\n", r.ok ? "ok" : "FAILED ",
                r.ok ? "" : r.error.c_str());

    EventBus bus2;
    GameEngine engine2(db, bus2, registry);
    StepResult sr2 = engine2.resumeFromSnapshot(std::move(edited), /*seed=*/42);

    std::printf("resumeFromSnapshot -> %s, %zu legal action(s)\n",
                stepKindName(sr2.kind), sr2.legal.size());
    std::printf("P1 score: %d before edit, %d after resume\n",
                before_p1, engine2.state().player(PlayerId::Player1).score);

    const size_t show = sr2.legal.size() < 8 ? sr2.legal.size() : 8;
    for (size_t i = 0; i < show; ++i) {
        std::printf("   legal[%zu] %s\n", i, sr2.legal[i].describe().c_str());
    }
    return 0;
}
