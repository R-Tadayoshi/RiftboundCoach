// Search the position with a tree, and report the LINE it found.
//
// `rank` answers "which single action scores best", by taking each legal
// action and then playing on AT RANDOM. That is honest and it is shallow:
// after the first move nothing is chosen, so there is no line to report and
// the numbers say only "this first move survives random continuations more
// often". Zarkhil put the limitation plainly: "the engine only gives the next
// card to play but not a sequence of cards to play that would help".
//
// This does the other thing. UCT builds a tree, so the continuation after the
// first move is CHOSEN rather than rolled, and the most-visited path down the
// tree is a line the search actually believes in.
//
// WHY NOT alpharune's own MCTS. Two independent reasons, both checked in its
// source rather than inferred:
//
//   1. MctsAgent reconstructs its OpenSpiel state by replaying
//      `action_history` from the start of the game. Our position is BUILT by
//      editing a state — that is what a position script is — and the header
//      says it outright: "StateEditor god-mode edits do NOT participate in
//      MCTS". It would plan against a different board than the one we handed
//      it, and not say so.
//   2. Its ISMCTS resampler is a Clone(), so the search reads the opponent's
//      real hand. Fine for self-play where the engine holds both. Useless
//      here, where the whole point is that we cannot see it.
//
// So the tree is built directly over GameState clones, and the hidden cards
// are handled by DETERMINIZATION, the same way `rank` does it: deal the
// opponent a plausible hand from what is left of their deck, search that
// world, then do it again with a different deal and pool the results. This is
// Perfect-Information Monte Carlo, and its known weakness is worth stating
// because it bounds what the output may claim: within one determinization the
// search knows their hand, so it can find lines that only work because it
// "knew" — strategy fusion. Pooling over many deals blunts that; it does not
// remove it. The line is therefore reported as a line the search explored,
// never as what will happen.
//
//   search <deck1> <deck2> <position.txt> [sims-per-determinization] [determinizations]

#include "cards/card_registry.h"
#include "core/card_db.h"
#include "core/events.h"
#include "core/game_state.h"
#include "engine/game_engine.h"
#include "io/state_editor.h"
#include "rules/deck_validator.h"
#include "position_script.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <map>
#include <memory>
#include <random>
#include <string>
#include <vector>

using namespace riftbound;

namespace {

constexpr int kMaxDecisions = 400;   // a playout that runs past this is a draw
constexpr double kUct = 1.41421356;  // sqrt(2), the textbook exploration constant

/* Reward is always from ONE player's point of view — the player to move at the
 * root, who is the person being coached. Storing it that way, rather than
 * per-node "wins for whoever moves here", is what keeps the backup correct
 * when the two players alternate: at a node where the opponent chooses, the
 * search maximises THEIR interest by minimising ours, and that is one
 * subtraction rather than a second set of counters to keep in step. */
double rewardFor(PlayerId root_player, PlayerId winner) {
    if (winner == PlayerId::None) return 0.5;        // draw or ran long
    return winner == root_player ? 1.0 : 0.0;
}

struct Node {
    int visits = 0;
    double reward = 0.0;                 // summed, from the root player's view
    PlayerId mover = PlayerId::None;     // who chooses here
    int action_count = 0;
    std::vector<std::unique_ptr<Node>> children;   // parallel to legal actions
    std::vector<std::string> labels;               // describe(state), for the line

    void widen(int n) {
        action_count = n;
        children.resize(n);
        labels.resize(n);
    }
    bool expanded() const { return action_count > 0; }
};

/// The search's own view of a child's value. Ours to maximise when we choose,
/// theirs when they do — which is the same number seen from the other side.
double valueFor(const Node& child, PlayerId chooser, PlayerId root_player) {
    if (child.visits == 0) return 0.0;
    const double q = child.reward / child.visits;
    return chooser == root_player ? q : 1.0 - q;
}

/// Play on at random from wherever the engine currently is.
PlayerId finishAtRandom(GameEngine& engine, StepResult sr,
                        std::mt19937_64& rng, int budget) {
    int decisions = 0;
    while (sr.kind == StepKind::NeedDecision && decisions < budget) {
        std::uniform_int_distribution<size_t> pick(0, sr.legal.size() - 1);
        sr = engine.applyChoice(static_cast<int>(pick(rng)));
        ++decisions;
    }
    if (sr.kind != StepKind::Done) return PlayerId::None;
    return engine.stepResult().winner;
}

/* One simulation: walk down the tree by UCB1 while every child has been tried,
 * expand the first untried action, then play the rest out at random.
 *
 * The engine is re-seated from `root_state` each time rather than carried
 * between simulations, because GameEngine owns the state it steps and there is
 * no cheap undo. Re-seating is O(copy of GameState), which is the price of
 * every rollout in `rank` too. */
double simulate(const CardDB& db, const CardRegistry& reg,
                const GameState& root_state, Node& root, PlayerId root_player,
                std::mt19937_64& rng, uint64_t seed, int depth_cap) {
    EventBus bus;
    GameEngine engine(db, bus, reg);
    GameState copy = root_state;
    StepResult sr = engine.resumeFromSnapshot(std::move(copy), seed);

    std::vector<Node*> path;
    Node* node = &root;
    path.push_back(node);
    int depth = 0;

    while (sr.kind == StepKind::NeedDecision && depth < depth_cap) {
        if (!node->expanded()) {
            node->widen(static_cast<int>(sr.legal.size()));
            node->mover = sr.perspective;
            for (size_t i = 0; i < sr.legal.size(); ++i) {
                node->labels[i] = sr.legal[i].describe(engine.state());
            }
        }

        // An untried action is worth more than any UCB1 score: a child with no
        // visits has no value to compare, and trying each once first is what
        // makes the average mean anything.
        int chosen = -1;
        for (int i = 0; i < node->action_count; ++i) {
            if (!node->children[i]) { chosen = i; break; }
        }

        if (chosen < 0) {
            double best = -1.0;
            for (int i = 0; i < node->action_count; ++i) {
                const Node& c = *node->children[i];
                const double explore =
                    kUct * std::sqrt(std::log(std::max(1, node->visits)) /
                                     std::max(1, c.visits));
                const double score = valueFor(c, node->mover, root_player) + explore;
                if (score > best) { best = score; chosen = i; }
            }
        }

        sr = engine.applyChoice(chosen);
        if (!node->children[chosen]) {
            node->children[chosen] = std::make_unique<Node>();
            node = node->children[chosen].get();
            path.push_back(node);
            break;   // one new node per simulation — the standard expansion rule
        }
        node = node->children[chosen].get();
        path.push_back(node);
        ++depth;
    }

    const PlayerId winner =
        sr.kind == StepKind::Done ? engine.stepResult().winner
                                  : finishAtRandom(engine, sr, rng, kMaxDecisions);
    const double r = rewardFor(root_player, winner);

    for (Node* n : path) { n->visits += 1; n->reward += r; }
    return r;
}

/// The most-visited path from the root: what the search kept coming back to.
/// Visits rather than value, deliberately — a child with a flattering average
/// over three visits is noise, and the visit count is the search's own measure
/// of how seriously it took a line.
///
/// Priority passes are dropped. A real line contains several of them in a row
/// — that is how the chain works — and printed out they bury the two or three
/// moves a player actually makes under procedure. They are not hidden: the
/// count of what was skipped is carried on the next real move, so a line that
/// is mostly passing still says so.
std::vector<std::string> principalVariation(const Node& root, int min_visits,
                                            int forced_first) {
    std::vector<std::string> line;
    const Node* n = &root;
    int skipped = 0;
    bool first = true;
    while (n && n->expanded()) {
        int best = -1, best_visits = 0;

        /* The line must START with the move the table recommends.
         *
         * The ranking is pooled across determinizations and this tree is one
         * of them, so its own most-visited root child can differ from the
         * pooled winner. A line that opens with a move the table did not
         * recommend is not a subtlety the reader will catch — it reads as the
         * engine contradicting itself, and one of the two is wrong. So the
         * first step is pinned and the rest descends normally. */
        if (first && forced_first >= 0 && forced_first < n->action_count &&
            n->children[forced_first]) {
            best = forced_first;
            best_visits = n->children[forced_first]->visits;
        } else {
            for (int i = 0; i < n->action_count; ++i) {
                if (!n->children[i]) continue;
                if (n->children[i]->visits > best_visits) {
                    best_visits = n->children[i]->visits;
                    best = i;
                }
            }
        }
        first = false;
        if (best < 0 || best_visits < min_visits) break;

        const std::string& label = n->labels[best];
        const bool procedural =
            label.find("PassPriority") != std::string::npos ||
            label.find("PlayFirstDecision") != std::string::npos;
        if (procedural) {
            ++skipped;
        } else {
            line.push_back(
                label + "   [" + std::to_string(best_visits) + " visits" +
                (skipped ? ", after " + std::to_string(skipped) + " pass(es)" : "") +
                "]");
            skipped = 0;
        }
        n = n->children[best].get();
    }
    return line;
}

struct RootStat {
    std::string label;
    int visits = 0;
    double reward = 0.0;
    double rate() const { return visits ? reward / visits : 0.0; }

    /// Standard error of the rate, as a proportion over `visits` samples.
    double stderr_() const {
        if (visits < 2) return 0.5;
        const double p = rate();
        return std::sqrt(p * (1.0 - p) / visits);
    }
};

/* Are these two far enough apart to order? Two standard errors of their
 * difference — the same bar `rank` uses, and for the same reason.
 *
 * A tree makes this MORE necessary rather than less. UCT spends its visits on
 * what looks good, so the leader accumulates samples and the also-rans do not;
 * comparing a 717-visit rate with a 294-visit one without accounting for that
 * would read a difference in attention as a difference in quality. */
bool separated(const RootStat& a, const RootStat& b) {
    const double se = std::sqrt(a.stderr_() * a.stderr_() + b.stderr_() * b.stderr_());
    return std::fabs(a.rate() - b.rate()) > 2.0 * se;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc < 4) {
        std::fprintf(stderr,
            "usage: search <deck1.txt> <deck2.txt> <position.txt> "
            "[sims-per-determinization] [determinizations]\n");
        return 2;
    }
    const int sims = argc > 4 ? std::atoi(argv[4]) : 600;
    const int worlds = argc > 5 ? std::atoi(argv[5]) : 12;

    CardRegistry registry;
    registry.loadAll();
    CardDB db;
    db.buildFromClasses(registry);

    auto sub1 = DeckValidator::loadFromDeckList(argv[1], db);
    auto sub2 = DeckValidator::loadFromDeckList(argv[2], db);

    GameState position;
    StepResult here;
    PositionLoadReport rep =
        loadPosition(db, registry, sub1, sub2, argv[3], position, here);
    if (rep.failed) {
        std::fprintf(stderr, "position has %d bad line(s); refusing to search a "
                             "board that does not match what was asked for\n",
                     rep.failed);
        return 1;
    }
    if (here.kind != StepKind::NeedDecision) {
        std::fprintf(stderr, "position is not a decision point\n");
        return 1;
    }
    const PlayerId root_player = here.perspective;
    const size_t root_actions = here.legal.size();

    std::printf("SEARCH — %d simulations x %d determinization(s) = %d playouts\n",
                sims, worlds, sims * worlds);
    if (rep.hidden[1] || rep.hidden[2]) {
        std::printf("hidden cards dealt fresh per determinization: P1 %d, P2 %d\n",
                    rep.hidden[1], rep.hidden[2]);
    } else {
        std::printf("no hidden cards declared — every determinization is the same "
                    "world, so the spread understates the real uncertainty\n");
    }
    std::printf("\n");

    std::vector<RootStat> totals(root_actions);
    std::unique_ptr<Node> keep;          // a tree to read the line out of
    int unfinished_worlds = 0;

    for (int w = 0; w < worlds; ++w) {
        const uint64_t seed = 0x9E3779B97F4A7C15ull * (w + 1);
        GameState world = position;
        std::mt19937_64 deal_rng(seed ^ 0xD1B54A32D192ED03ull);
        for (int p = 1; p <= 2; ++p) {
            if (rep.hidden[p] > 0) {
                dealHidden(world, static_cast<PlayerId>(p), rep.hidden[p], deal_rng);
            }
        }

        /* The root's legal actions must be the SAME list in every world, or the
         * per-action totals are being added up across different actions. Dealing
         * to the opponent cannot change what we may do, so a mismatch means
         * something else moved — and silently summing mismatched columns is
         * exactly the class of error this project keeps finding. Refuse. */
        EventBus check_bus;
        GameEngine check(db, check_bus, registry);
        GameState check_copy = world;
        StepResult ws = check.resumeFromSnapshot(std::move(check_copy), seed);
        if (ws.kind != StepKind::NeedDecision || ws.legal.size() != root_actions) {
            std::fprintf(stderr,
                "REFUSING: determinization %d offers %zu legal actions, the "
                "position offered %zu. Pooling these would add up different "
                "actions under one heading.\n",
                w, ws.kind == StepKind::NeedDecision ? ws.legal.size() : 0u,
                root_actions);
            return 1;
        }

        auto root = std::make_unique<Node>();
        std::mt19937_64 rng(seed);
        for (int s = 0; s < sims; ++s) {
            simulate(db, registry, world, *root, root_player, rng, seed + s, 40);
        }

        if (!root->expanded()) { ++unfinished_worlds; continue; }
        for (int i = 0; i < root->action_count && i < static_cast<int>(root_actions); ++i) {
            if (totals[i].label.empty()) totals[i].label = root->labels[i];
            if (!root->children[i]) continue;
            totals[i].visits += root->children[i]->visits;
            totals[i].reward += root->children[i]->reward;
        }
        if (!keep) keep = std::move(root);
    }

    std::vector<int> order(totals.size());
    for (size_t i = 0; i < order.size(); ++i) order[i] = static_cast<int>(i);
    std::sort(order.begin(), order.end(), [&](int a, int b) {
        return totals[a].rate() > totals[b].rate();
    });

    for (int i : order) {
        const RootStat& r = totals[i];
        if (!r.visits) continue;
        // Same row shape the rollout ranker prints, so one parser reads both.
        const int wins = static_cast<int>(std::lround(r.reward));
        std::printf("  %5.1f%%  %-52s (%d-%d, %d visits)\n",
                    r.rate() * 100.0, r.label.c_str(),
                    wins, r.visits - wins, r.visits);
    }

    /* The same verdict lines `rank` prints, because one parser reads both and
     * because the honest answer to "which is best" is often "these are not
     * distinguishable". Without this the caller sees no verdict at all and
     * defaults to treating every row as tied. */
    std::vector<int> ranked;
    for (int i : order) if (totals[i].visits) ranked.push_back(i);
    if (ranked.size() >= 2) {
        size_t tied = 1;
        while (tied < ranked.size() &&
               !separated(totals[ranked[0]], totals[ranked[tied]])) ++tied;
        if (tied > 1) {
            std::printf("\nTOO CLOSE TO CALL: the top %zu are inside the noise.\n", tied);
        } else {
            std::printf("\nCLEAR: \"%s\" is ahead of the rest.\n",
                        totals[ranked[0]].label.c_str());
        }
        const RootStat& last = totals[ranked.back()];
        if (separated(totals[ranked[0]], last)) {
            std::printf("Worst: \"%s\" at %.1f%%\n", last.label.c_str(), last.rate() * 100.0);
        }
    }

    if (keep) {
        const int recommended = ranked.empty() ? -1 : ranked[0];
        const auto line =
            principalVariation(*keep, std::max(2, sims / 50), recommended);
        if (line.size() > 1) {
            std::printf("\nTHE LINE the search kept coming back to:\n");
            for (size_t i = 0; i < line.size(); ++i) {
                std::printf("  %zu. %s\n", i + 1, line[i].c_str());
            }
            std::printf("\nThis is one line the search explored under ONE sampling of "
                        "their hidden cards,\nnot a prediction. Inside that sampling "
                        "the search knew their hand, so a line\nthat depends on "
                        "knowing it will look better here than it is.\n");
        } else {
            std::printf("\nNo line to report — the search did not settle on a "
                        "continuation it revisited.\n");
        }
    }
    if (unfinished_worlds) {
        std::printf("\n%d determinization(s) produced no tree at all.\n", unfinished_worlds);
    }
    return 0;
}
