// Rank the legal moves from a constructed position, by playing each one out.
//
// This is the thing the LLM coach cannot do. It reads the board correctly and
// never proposes an illegal play, but nothing in it ranks one legal line above
// another — it says "here is an option", never "this one is better". Zarkhil
// put it plainly: "it just says one of the options I have, not what the better
// option is."
//
// Method: for each legal action at the position, take the action and then play
// the rest of the game out at random, many times, and count how often the
// player to move ends up winning.
//
// The hands we cannot see are DETERMINIZED: a `hidden P2 4` line in the
// position says the opponent holds four cards of unknown identity, and each
// rollout deals them a different four from what is left of their deck — which
// is exactly the unseen pool, since the position has already placed everything
// visible. So the average is taken over what they might hold, rather than over
// one invented hand repeated a hundred times.
//
// That distinction is the whole reason this is not just alpharune's ISMCTS.
// Its resampler is a `Clone()`, so its search reads the opponent's real cards
// — fine for self-play where the engine holds both hands, useless here where
// we do not have them to read.
//
//   rank <deck1> <deck2> <position.txt> [rollouts-per-action]

#include "cards/card_registry.h"
#include "core/card_db.h"
#include "core/events.h"
#include "core/game_state.h"
#include "engine/game_engine.h"
#include "io/state_editor.h"
#include "rules/deck_validator.h"
#include "position_script.h"

#include <algorithm>
#include <cstdio>
#include <cmath>
#include <random>
#include <string>
#include <vector>

using namespace riftbound;

namespace {

/// Play from `start` to the end of the game, choosing uniformly at random.
/// Returns the winner, or None if the game did not terminate in time.
PlayerId rollout(const CardDB& db, const CardRegistry& reg,
                 const GameState& start, uint64_t seed, int max_decisions) {
    EventBus bus;
    GameEngine engine(db, bus, reg);
    GameState copy = start;
    StepResult sr = engine.resumeFromSnapshot(std::move(copy), seed);

    std::mt19937_64 rng(seed);
    int decisions = 0;
    while (sr.kind == StepKind::NeedDecision && decisions < max_decisions) {
        std::uniform_int_distribution<size_t> pick(0, sr.legal.size() - 1);
        sr = engine.applyChoice(static_cast<int>(pick(rng)));
        ++decisions;
    }
    if (sr.kind != StepKind::Done) return PlayerId::None;
    return engine.stepResult().winner;
}

struct Ranked {
    int index = 0;
    std::string label;
    int wins = 0, losses = 0, draws = 0, unfinished = 0;
    int decided() const { return wins + losses + draws; }
    double rate() const {
        return decided() ? static_cast<double>(wins) / decided() : 0.0;
    }
    /// Standard error of the win rate, for a proportion over `decided` samples.
    double stderr_() const {
        const int n = decided();
        if (n < 2) return 0.5;
        const double p = rate();
        return std::sqrt(p * (1.0 - p) / n);
    }
};

/* Are these two rates far enough apart to order? Compared at roughly two
 * standard errors of their difference — the usual bar for "not just noise".
 *
 * This matters more than it looks. At 40 rollouts per action this position
 * ranked StandardMove first; at 150 it ranked a PlayCard first, and the top
 * four sat within seven points of each other both times. Reporting an order
 * over those four would be inventing a preference out of variance, which is
 * exactly the failure this project keeps finding in the LLM. */
inline bool separated(const Ranked& a, const Ranked& b) {
    const double se = std::sqrt(a.stderr_() * a.stderr_() + b.stderr_() * b.stderr_());
    return std::fabs(a.rate() - b.rate()) > 2.0 * se;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc < 4) {
        std::fprintf(stderr,
            "usage: rank <deck1.txt> <deck2.txt> <position.txt> [rollouts]\n");
        return 2;
    }
    /* 1200, measured rather than guessed. On the example position the top
     * four actions sat inside the noise at 40, at 150 and at 400; at 1200 the
     * best separated cleanly at 82.7%. Five actions x 1200 rollouts is 6000
     * games in about 80 seconds, which is nothing against a turn you get
     * minutes to think about. Below roughly a thousand this tool reports
     * TOO CLOSE TO CALL and tells you nothing. */
    const int rollouts = argc > 4 ? std::atoi(argv[4]) : 1200;
    const int kMaxDecisions = 400;

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
        std::fprintf(stderr, "position has %d bad line(s); refusing to rank a "
                             "board that does not match what was asked for\n",
                     rep.failed);
        return 1;
    }
    if (here.kind != StepKind::NeedDecision) {
        std::fprintf(stderr, "position is not a decision point\n");
        return 1;
    }

    const PlayerId me = here.perspective;
    std::printf("ranking %zu legal action(s) for %s, %d rollout(s) each\n",
                here.legal.size(), toString(me), rollouts);
    if (rep.hidden[1] || rep.hidden[2]) {
        std::printf("hidden cards sampled per rollout: P1 %d, P2 %d\n",
                    rep.hidden[1], rep.hidden[2]);
    } else {
        std::printf("no hidden cards declared — every rollout sees the same "
                    "hands, so the spread understates the real uncertainty\n");
    }
    std::printf("\n");

    std::vector<Ranked> out;
    for (size_t i = 0; i < here.legal.size(); ++i) {
        Ranked r{static_cast<int>(i), here.legal[i].describe(position), 0, 0, 0, 0};

        for (int n = 0; n < rollouts; ++n) {
            const uint64_t seed = 0x9E3779B97F4A7C15ull * (i + 1) + n;

            // Take the action being judged, then let chance do the rest.
            EventBus bus;
            GameEngine engine(db, bus, registry);
            GameState copy = position;

            /* Deal each side's unseen cards afresh for this rollout. Ours too:
             * we know our hand but not our deck order, and the opponent's hand
             * we know only the size of. */
            std::mt19937_64 deal_rng(seed ^ 0xD1B54A32D192ED03ull);
            for (int p = 1; p <= 2; ++p) {
                if (rep.hidden[p] > 0) {
                    dealHidden(copy, static_cast<PlayerId>(p), rep.hidden[p], deal_rng);
                }
            }

            StepResult sr = engine.resumeFromSnapshot(std::move(copy), seed);
            if (sr.kind != StepKind::NeedDecision) { ++r.unfinished; continue; }
            sr = engine.applyChoice(static_cast<int>(i));

            PlayerId winner;
            if (sr.kind == StepKind::Done) {
                winner = engine.stepResult().winner;
            } else {
                winner = rollout(db, registry, engine.state(), seed, kMaxDecisions);
            }

            if (winner == PlayerId::None) ++r.unfinished;
            else if (winner == me) ++r.wins;
            else ++r.losses;
        }
        out.push_back(std::move(r));
    }

    std::stable_sort(out.begin(), out.end(),
                     [](const Ranked& a, const Ranked& b) { return a.rate() > b.rate(); });

    for (const auto& r : out) {
        std::printf("  %5.1f%%  %-44s  (%d-%d%s)\n", r.rate() * 100.0,
                    r.label.c_str(), r.wins, r.losses,
                    r.unfinished ? (", " + std::to_string(r.unfinished) + " unfinished").c_str() : "");
    }

    /* What matters is not the whole spread but whether the TOP is separated
     * from what follows it. A best-to-worst spread of 47 points looks decisive
     * while the four actions that are actually in contention sit within seven
     * points of each other. */
    if (out.size() > 1) {
        size_t tied = 1;
        while (tied < out.size() && !separated(out[0], out[tied])) ++tied;

        if (tied == 1) {
            std::printf("\nCLEAR: \"%s\" is ahead of the next option by more than "
                        "the noise at %d rollouts.\n",
                        out[0].label.c_str(), rollouts);
        } else {
            std::printf("\nTOO CLOSE TO CALL: the top %zu actions are within noise "
                        "of each other at %d rollouts.\n", tied, rollouts);
            for (size_t i = 0; i < tied; ++i) {
                std::printf("    %5.1f%% +/- %.1f  %s\n", out[i].rate() * 100.0,
                            out[i].stderr_() * 200.0, out[i].label.c_str());
            }
            std::printf("  Raise the rollout count to separate them, or treat "
                        "them as equivalent.\n");
        }

        /* The one thing a rollout count this low does settle reliably. */
        const auto& worst = out.back();
        if (separated(out[0], worst)) {
            std::printf("  Worst: \"%s\" at %.1f%% — that gap IS outside the noise.\n",
                        worst.label.c_str(), worst.rate() * 100.0);
        }
    }
    return 0;
}
