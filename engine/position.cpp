// Rebuild a board we actually played inside the engine, and ask it what is
// legal from there.
//
// Input is a plain-text position script rather than JSON, on purpose: it is
// readable, diffable, and trivial to emit from the JS side. A position you
// cannot read is a position you cannot debug, and the whole point of this
// step is that the board in the engine matches the board on screen.
//
//   turn 11
//   phase main
//   turnplayer P1
//   score P1 5
//   score P2 6
//   legend P1 Blade Dancer
//   place P1 Irelia, Fervent bfB ready
//   place P1 Draven, Audacious hand
//   place P2 Sprite bfA exhausted
//   runes P1 11 0
//
//   clear  P1 all       empty a side's hand and board before placing
//   energy P1 11        available energy in the rune pool
//   power  P1 3         available any-domain power
//
// Zones: hand, base, trash, bfA, bfB, deck. Suffix ready|exhausted for units.
// Card names may contain spaces and commas; the zone is the LAST token, and
// an optional ready/exhausted after it.

#include "cards/card_registry.h"
#include "core/card_db.h"
#include "core/events.h"
#include "core/game_state.h"
#include "engine/game_engine.h"
#include "io/state_editor.h"
#include "rules/deck_validator.h"

#include <algorithm>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

using namespace riftbound;

namespace {

std::string trim(std::string s) {
    auto notspace = [](unsigned char c) { return !std::isspace(c); };
    s.erase(s.begin(), std::find_if(s.begin(), s.end(), notspace));
    s.erase(std::find_if(s.rbegin(), s.rend(), notspace).base(), s.end());
    return s;
}

PlayerId playerOf(const std::string& s) {
    if (s == "P1" || s == "p1") return PlayerId::Player1;
    if (s == "P2" || s == "p2") return PlayerId::Player2;
    return PlayerId::None;
}

/// Find a card the player owns, by name, preferring one still in the deck so
/// that placing a card twice takes two different copies.
GameObjectId findOwned(GameState& st, PlayerId who, const std::string& name,
                       bool prefer_deck = true) {
    GameObjectId fallback = kInvalidId;
    for (auto& [id, obj] : st.objects) {
        if (obj.owner != who) continue;
        if (obj.name != name) continue;
        if (!prefer_deck) return id;
        if (obj.zone == ZoneType::MainDeck) return id;
        if (fallback == kInvalidId) fallback = id;
    }
    return fallback;
}

struct Line { std::vector<std::string> tok; std::string raw; };

std::vector<Line> readScript(const std::string& path) {
    std::vector<Line> out;
    std::ifstream in(path);
    std::string line;
    while (std::getline(in, line)) {
        const auto hash = line.find('#');
        if (hash != std::string::npos) line = line.substr(0, hash);
        line = trim(line);
        if (line.empty()) continue;
        Line l;
        l.raw = line;
        std::istringstream ss(line);
        std::string t;
        while (ss >> t) l.tok.push_back(t);
        out.push_back(std::move(l));
    }
    return out;
}

const char* stepKindName(StepKind k) {
    return k == StepKind::Done ? "Done" : "NeedDecision";
}

}  // namespace

int main(int argc, char** argv) {
    if (argc < 4) {
        std::fprintf(stderr,
            "usage: position <deck1.txt> <deck2.txt> <position.txt>\n");
        return 2;
    }
    const std::string deck1 = argv[1], deck2 = argv[2], script = argv[3];

    CardRegistry registry;
    registry.loadAll();
    CardDB db;
    db.buildFromClasses(registry);

    auto sub1 = DeckValidator::loadFromDeckList(deck1, db);
    auto sub2 = DeckValidator::loadFromDeckList(deck2, db);

    EventBus bus;
    GameEngine engine(db, bus, registry);
    StepResult sr = engine.beginGame(sub1, sub2, /*seed=*/1);

    // Get past mulligans without making real choices: take the first option
    // until the engine reaches a main phase, which is the earliest point a
    // constructed position makes sense.
    int guard = 0;
    while (sr.kind == StepKind::NeedDecision &&
           engine.state().turn.phase != TurnPhase::MainPhase && guard < 200) {
        sr = engine.applyChoice(0);
        ++guard;
    }
    std::printf("reached %s after %d setup choices\n",
                engine.state().turn.phase == TurnPhase::MainPhase ? "MainPhase" : "?",
                guard);

    GameState st = engine.state();
    StateEditor ed;
    int applied = 0, failed = 0;

    for (const auto& l : readScript(script)) {
        const std::string& cmd = l.tok[0];
        auto fail = [&](const std::string& why) {
            std::printf("  ! %-40s %s\n", l.raw.c_str(), why.c_str());
            ++failed;
        };

        if (cmd == "score" && l.tok.size() == 3) {
            auto r = ed.setPlayerScore(st, playerOf(l.tok[1]), std::stoi(l.tok[2]));
            r.ok ? void(++applied) : fail(r.error);

        } else if (cmd == "turnplayer" && l.tok.size() == 2) {
            auto r = ed.setTurnPlayer(st, playerOf(l.tok[1]));
            r.ok ? void(++applied) : fail(r.error);

        } else if (cmd == "turn" && l.tok.size() == 2) {
            st.turn.turn_number = std::stoi(l.tok[1]);
            ++applied;

        } else if (cmd == "phase" && l.tok.size() == 2) {
            auto r = ed.setPhase(st, TurnPhase::MainPhase);
            r.ok ? void(++applied) : fail(r.error);

        } else if (cmd == "clear" && l.tok.size() == 3) {
            /* A position must REPLACE the engine's board, not add to it.
             * Without this the constructed hand is our cards plus whatever
             * the deal happened to give, and every count is wrong while
             * everything still looks healthy — the board on screen and the
             * board in the engine quietly disagree. */
            const PlayerId who = playerOf(l.tok[1]);
            const std::string what = l.tok[2];
            std::vector<GameObjectId> doomed;
            for (auto& [id, obj] : st.objects) {
                if (obj.owner != who) continue;
                const bool onBoard = obj.zone == ZoneType::BattlefieldZone ||
                                     obj.zone == ZoneType::Base;
                if (what == "hand"  && obj.zone != ZoneType::Hand) continue;
                if (what == "board" && !onBoard) continue;
                if (what == "all"   && obj.zone != ZoneType::Hand && !onBoard) continue;
                if (what != "hand" && what != "board" && what != "all") continue;
                doomed.push_back(id);
            }
            if (doomed.empty() && what != "hand" && what != "board" && what != "all") {
                fail("clear takes hand | board | all");
            } else {
                for (auto id : doomed) ed.moveObject(st, id, who, ZoneType::MainDeck, false);
                std::printf("  cleared %zu card(s) from %s %s\n",
                            doomed.size(), l.tok[1].c_str(), what.c_str());
                ++applied;
            }

        } else if (cmd == "energy" && l.tok.size() == 3) {
            // The rune POOL, not runes on board: what is available to spend
            // right now, which is what decides whether a card is playable.
            auto r = ed.setPlayerEnergy(st, playerOf(l.tok[1]), std::stoi(l.tok[2]));
            r.ok ? void(++applied) : fail(r.error);

        } else if (cmd == "power" && l.tok.size() == 3) {
            // -1 is the universal / any-domain bucket.
            auto r = ed.setPlayerPower(st, playerOf(l.tok[1]), -1, std::stoi(l.tok[2]));
            r.ok ? void(++applied) : fail(r.error);

        } else if (cmd == "place" && l.tok.size() >= 4) {
            const PlayerId who = playerOf(l.tok[1]);
            // The tail is [zone] or [zone, ready|exhausted]; the name is
            // everything between the player and that tail.
            size_t tail = l.tok.size() - 1;
            bool exhausted = false, has_state = false;
            if (l.tok[tail] == "ready" || l.tok[tail] == "exhausted") {
                exhausted = (l.tok[tail] == "exhausted");
                has_state = true;
                --tail;
            }
            const std::string zone = l.tok[tail];
            std::string name;
            for (size_t i = 2; i < tail; ++i) name += (i > 2 ? " " : "") + l.tok[i];

            const GameObjectId id = findOwned(st, who, name);
            if (id == kInvalidId) { fail("no such card owned by that player"); continue; }

            EditResult r = EditResult::fail("unknown zone " + zone);
            if (zone == "hand")       r = ed.moveObject(st, id, who, ZoneType::Hand);
            else if (zone == "base")  r = ed.moveObject(st, id, who, ZoneType::Base);
            else if (zone == "trash") r = ed.moveObject(st, id, who, ZoneType::Trash);
            else if (zone == "deck")  r = ed.moveObject(st, id, who, ZoneType::MainDeck);
            else if (zone == "bfA" || zone == "bfB") {
                const size_t which = (zone == "bfA") ? 0 : 1;
                if (st.battlefields.size() <= which) r = EditResult::fail("no such battlefield");
                else r = ed.moveObjectToBattlefield(st, id, st.battlefields[which].id);
            }
            if (!r.ok) { fail(r.error); continue; }
            if (has_state) ed.setObjectExhausted(st, id, exhausted);
            ++applied;

        } else {
            fail("unrecognised");
        }
    }

    std::printf("position: %d edit(s) applied, %d failed\n", applied, failed);

    EventBus bus2;
    GameEngine engine2(db, bus2, registry);
    StepResult sr2 = engine2.resumeFromSnapshot(std::move(st), /*seed=*/1);

    const GameState& s2 = engine2.state();
    std::printf("resumed -> %s | turn %d | P1 %d : %d P2 | %zu legal\n",
                stepKindName(sr2.kind), s2.turn.turn_number,
                s2.player(PlayerId::Player1).score,
                s2.player(PlayerId::Player2).score,
                sr2.legal.size());

    for (size_t i = 0; i < sr2.legal.size(); ++i) {
        std::printf("  [%zu] %s\n", i, sr2.legal[i].describe().c_str());
    }
    return failed ? 1 : 0;
}
