// Rebuild a described board inside the engine and print what is legal there.
//
// The parsing and editing live in position_script.h, shared with rank.cpp, so
// there is one definition of what a position means. Two parsers would drift,
// and a position that means different things to the lister and the ranker is
// worse than no position at all.

#include "position_script.h"

#include <cstdio>
#include <string>

using namespace riftbound;

int main(int argc, char** argv) {
    if (argc < 4) {
        std::fprintf(stderr, "usage: position <deck1.txt> <deck2.txt> <position.txt>\n");
        return 2;
    }

    CardRegistry registry;
    registry.loadAll();
    CardDB db;
    db.buildFromClasses(registry);

    auto sub1 = DeckValidator::loadFromDeckList(argv[1], db);
    auto sub2 = DeckValidator::loadFromDeckList(argv[2], db);

    GameState position;
    StepResult here;
    PositionLoadReport rep =
        loadPosition(db, registry, sub1, sub2, argv[3], position, here, /*verbose=*/true);

    std::printf("position: %d edit(s) applied, %d failed (%d setup choices)\n",
                rep.applied, rep.failed, rep.setup_choices);

    const char* kind = here.kind == StepKind::Done ? "Done" : "NeedDecision";
    std::printf("resumed -> %s | turn %d | P1 %d : %d P2 | %zu legal\n",
                kind, position.turn.turn_number,
                position.player(PlayerId::Player1).score,
                position.player(PlayerId::Player2).score,
                here.legal.size());

    for (size_t i = 0; i < here.legal.size(); ++i) {
        std::printf("  [%zu] %s\n", i, here.legal[i].describe(position).c_str());
    }
    return rep.failed ? 1 : 0;
}
