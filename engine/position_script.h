#pragma once
// Turning a written-down board into an engine position.
//
// Shared by position.cpp (show me the legal moves) and rank.cpp (tell me
// which is better) so there is one implementation of what a position means.
// Two parsers would drift, and a position that means different things to the
// lister and the ranker is worse than no position at all.
//
// Format (one command per line, # starts a comment):
//
//   clear  P1 all       empty a side's hand and board FIRST — a position
//                       replaces the dealt board, it does not add to it
//   turn   11
//   phase  main
//   turnplayer P1
//   score  P1 5
//   energy P1 11        the rune POOL: what can be spent right now
//   power  P1 3         any-domain power
//   place  P1 <card name> <zone> [ready|exhausted]
//   expect legend P1 <card name>   assert the deck's legend is the one on
//                                  screen — it cannot be placed, so it is
//                                  checked
//
// Zones: hand base trash bfA bfB deck

#include "cards/card_registry.h"
#include "core/card_db.h"
#include "core/events.h"
#include "core/game_state.h"
#include "engine/game_engine.h"
#include "io/state_editor.h"
#include "rules/deck_validator.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <fstream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

namespace riftbound {

struct PositionLoadReport {
    int applied = 0;
    int failed = 0;
    int setup_choices = 0;
    std::vector<std::string> errors;
};

namespace position_detail {

inline std::string trim(std::string s) {
    auto notspace = [](unsigned char c) { return !std::isspace(c); };
    s.erase(s.begin(), std::find_if(s.begin(), s.end(), notspace));
    s.erase(std::find_if(s.rbegin(), s.rend(), notspace).base(), s.end());
    return s;
}

inline PlayerId playerOf(const std::string& s) {
    if (s == "P1" || s == "p1") return PlayerId::Player1;
    if (s == "P2" || s == "p2") return PlayerId::Player2;
    return PlayerId::None;
}

/// A card the player owns, by name. Copies still in the deck are taken first
/// so that placing the same card twice takes two different copies.
inline GameObjectId findOwned(GameState& st, PlayerId who, const std::string& name) {
    GameObjectId fallback = kInvalidId;
    for (auto& [id, obj] : st.objects) {
        if (obj.owner != who || obj.name != name) continue;
        if (obj.zone == ZoneType::MainDeck) return id;
        if (fallback == kInvalidId) fallback = id;
    }
    return fallback;
}

struct Line { std::vector<std::string> tok; std::string raw; };

inline std::vector<Line> readScript(const std::string& path) {
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

}  // namespace position_detail

/// Build the described board and leave the engine paused on it.
/// `out_state` is the constructed GameState; `out_step` is what the engine
/// says about it (kind, whose decision, and the legal actions).
inline PositionLoadReport loadPosition(const CardDB& db,
                                       const CardRegistry& registry,
                                       const DeckSubmission& deck1,
                                       const DeckSubmission& deck2,
                                       const std::string& script_path,
                                       GameState& out_state,
                                       StepResult& out_step,
                                       bool verbose = false) {
    using namespace position_detail;
    PositionLoadReport rep;

    EventBus bus;
    GameEngine engine(db, bus, registry);
    StepResult sr = engine.beginGame(deck1, deck2, /*seed=*/1);

    // Past mulligans, to the earliest point a constructed position is meaningful.
    while (sr.kind == StepKind::NeedDecision &&
           engine.state().turn.phase != TurnPhase::MainPhase &&
           rep.setup_choices < 200) {
        sr = engine.applyChoice(0);
        ++rep.setup_choices;
    }

    GameState st = engine.state();
    StateEditor ed;

    for (const auto& l : readScript(script_path)) {
        const std::string& cmd = l.tok[0];
        auto fail = [&](const std::string& why) {
            rep.errors.push_back(l.raw + " -- " + why);
            if (verbose) std::printf("  ! %-40s %s\n", l.raw.c_str(), why.c_str());
            ++rep.failed;
        };

        if (cmd == "score" && l.tok.size() == 3) {
            auto r = ed.setPlayerScore(st, playerOf(l.tok[1]), std::stoi(l.tok[2]));
            r.ok ? void(++rep.applied) : fail(r.error);

        } else if (cmd == "turnplayer" && l.tok.size() == 2) {
            auto r = ed.setTurnPlayer(st, playerOf(l.tok[1]));
            r.ok ? void(++rep.applied) : fail(r.error);

        } else if (cmd == "turn" && l.tok.size() == 2) {
            st.turn.turn_number = std::stoi(l.tok[1]);
            ++rep.applied;

        } else if (cmd == "phase" && l.tok.size() == 2) {
            auto r = ed.setPhase(st, TurnPhase::MainPhase);
            r.ok ? void(++rep.applied) : fail(r.error);

        } else if (cmd == "energy" && l.tok.size() == 3) {
            auto r = ed.setPlayerEnergy(st, playerOf(l.tok[1]), std::stoi(l.tok[2]));
            r.ok ? void(++rep.applied) : fail(r.error);

        } else if (cmd == "power" && l.tok.size() == 3) {
            auto r = ed.setPlayerPower(st, playerOf(l.tok[1]), -1, std::stoi(l.tok[2]));
            r.ok ? void(++rep.applied) : fail(r.error);

        } else if (cmd == "clear" && l.tok.size() == 3) {
            const PlayerId who = playerOf(l.tok[1]);
            const std::string what = l.tok[2];
            if (what != "hand" && what != "board" && what != "all") {
                fail("clear takes hand | board | all");
            } else {
                std::vector<GameObjectId> doomed;
                for (auto& [id, obj] : st.objects) {
                    if (obj.owner != who) continue;
                    const bool onBoard = obj.zone == ZoneType::BattlefieldZone ||
                                         obj.zone == ZoneType::Base;
                    const bool inHand = obj.zone == ZoneType::Hand;
                    if (what == "hand"  && !inHand)  continue;
                    if (what == "board" && !onBoard) continue;
                    if (what == "all"   && !inHand && !onBoard) continue;
                    doomed.push_back(id);
                }
                for (auto id : doomed) ed.moveObject(st, id, who, ZoneType::MainDeck, false);
                if (verbose)
                    std::printf("  cleared %zu card(s) from %s %s\n",
                                doomed.size(), l.tok[1].c_str(), what.c_str());
                ++rep.applied;
            }

        } else if (cmd == "expect" && l.tok.size() >= 4 && l.tok[1] == "legend") {
            /* A legend cannot be placed: it comes from the deck file, set up
             * before any edit runs. So the position ASSERTS which legend it
             * expects, and a mismatch is a hard failure rather than a note.
             *
             * This matters more than it sounds. A legend sits in play all
             * game and its abilities are usually the cheapest thing a player
             * has — the line that decided turn 11 of the game this was built
             * for was a legend readying a unit. Rank a position whose legend
             * is not the one on screen and every number is about a different
             * game. */
            const PlayerId who = playerOf(l.tok[2]);
            std::string want;
            for (size_t i = 3; i < l.tok.size(); ++i) want += (i > 3 ? " " : "") + l.tok[i];

            std::string got;
            for (auto& [id, obj] : st.objects) {
                if (obj.owner == who && obj.zone == ZoneType::LegendZone) { got = obj.name; break; }
            }
            if (got.empty()) fail("that player has no legend in the legend zone");
            else if (got != want) fail("deck legend is \"" + got + "\", position expects \"" + want + "\"");
            else ++rep.applied;

        } else if (cmd == "place" && l.tok.size() >= 4) {
            const PlayerId who = playerOf(l.tok[1]);
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
            if (id == kInvalidId) { fail("no card of that name owned by that player"); continue; }

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
            ++rep.applied;

        } else {
            fail("unrecognised command");
        }
    }

    // Resume on a fresh engine so the caller owns a clean, paused position.
    static thread_local std::unique_ptr<EventBus> resume_bus;
    static thread_local std::unique_ptr<GameEngine> resume_engine;
    resume_bus = std::make_unique<EventBus>();
    resume_engine = std::make_unique<GameEngine>(db, *resume_bus, registry);

    GameState to_resume = st;
    out_step = resume_engine->resumeFromSnapshot(std::move(to_resume), /*seed=*/1);
    out_state = st;
    return rep;
}

}  // namespace riftbound
