/* OpenRouter, the thinnest client that does the job.
 *
 * The key is read from the environment and never written anywhere: not to the
 * card cache, not to the state file, not into a log line.
 */
"use strict";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/* Checked against OpenRouter's own model list rather than remembered:
 * claude-sonnet-5 is both newer and cheaper than the 4.5 this defaulted to
 * ($2/$10 per Mtok against $3/$15). RBC_MODEL overrides it with any slug
 * OpenRouter serves — haiku-4.5 for a cheaper run, opus-5 for a harder think. */
const DEFAULT_MODEL = process.env.RBC_MODEL || "anthropic/claude-sonnet-5";

/* Room for the answer AND the thinking in front of it.
 *
 * This was 400, which is plenty for six sentences of advice and nowhere near
 * enough for a reasoning model: Sonnet 5 and Opus 5 spend the budget thinking,
 * hit the ceiling, and return an empty message. Haiku 4.5 reasons less and so
 * fit under the old cap, which made it look like the only model that worked.
 *
 * The cap is not what you pay — usage is — so it is set well clear of both.
 * At 2000 a high-effort answer came back cut off mid-sentence after spending
 * 1727 of it thinking; at 4000 an answer at the provider default did the same after
 * 3861. Effort does not cap thinking, so the budget has to clear the worst
 * case rather than the expected one. */
const MAX_TOKENS = Number(process.env.RBC_MAX_TOKENS || 6000);

/* How hard the model thinks before answering.
 *
 * "low" is a GUESS, not a finding. The case for it: a turn has a clock, and
 * the board handed to the model is small and fully specified, so there may not
 * be much to think about. The case against it: the work that matters here is
 * arithmetic — summing might at a battlefield, checking what a rune spread can
 * actually pay for — and that is exactly what thinking buys.
 *
 * Reasoning tokens bill at the output rate, so effort costs real money on the
 * larger models, though still cents per session. Settle it with
 * `--compare` and RBC_COMPARE carrying "@effort" entries rather than taking
 * this default's word for it. */
const REASONING_EFFORT = process.env.RBC_REASONING || "low";

/* Reasoning efforts OpenRouter accepts, as fractions of max_tokens:
 * none 0, minimal ~10%, low ~20%, medium ~50%, high ~80%, max/xhigh ~95%.
 *
 * "default" is ours, not OpenRouter's: it sends no reasoning field at all and
 * lets the model do whatever it does unasked. That is NOT the same as off —
 * on a Sonnet 5 run, sending nothing produced 2314 reasoning tokens while
 * "low" produced none. This file used to treat "off" as "send nothing", so a
 * run labelled off was really the provider default thinking hard, and the
 * comparison it fed was between three labels, two of which were lying. */
const EFFORTS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "default",
]);

function applyReasoning(body, effort) {
  const want = (effort || "default").toLowerCase();
  /* A typo must not quietly become "provider default" — that is how a
   * mislabelled run gets read as a finding. */
  if (!EFFORTS.has(want)) {
    throw new Error(
      `"${effort}" is not a reasoning effort. Use one of: ${[...EFFORTS].join(", ")}. ` +
        `("off" was an older name for "none"; it used to mean "send nothing", which is ` +
        `"default" and is not off at all.)`
    );
  }
  if (want === "default") return; // send no reasoning field
  body.reasoning = { effort: want };
}

async function ask({
  system,
  user,
  model = DEFAULT_MODEL,
  effort = REASONING_EFFORT,
  apiKey = process.env.OPENROUTER_API_KEY,
}) {
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Export it (or `set` it on Windows), or run with --dry-run to see the prompt without sending it."
    );
  }

  /* An "@effort" suffix is meant to be split off by the caller. If one reaches
   * here it has been passed through as part of the slug, and OpenRouter will
   * answer "not a valid model ID" — which is true, and unhelpful, because the
   * real fault is a copy of the code from before efforts were parsed. */
  if (model.includes("@")) {
    const [slug, effortPart] = [model.slice(0, model.lastIndexOf("@")), model.slice(model.lastIndexOf("@") + 1)];
    throw new Error(
      `"${model}" is not a model — "@${effortPart}" is a reasoning effort and should have been ` +
        `split off before sending. This copy of the code predates that; run \`git pull\`. ` +
        `(The model is "${slug}".)`
    );
  }

  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: MAX_TOKENS,
  };
  applyReasoning(body, effort);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "x-title": "Riftbound Coach",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // The body carries the reason (bad key, unknown model, no credit) and the
    // status alone does not.
    throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const payload = await res.json();
  const choice = payload.choices?.[0] || {};
  const text = choice.message?.content?.trim();

  if (!text) {
    /* An empty message is not "no answer" — it is almost always the budget
     * running out mid-thought, and saying so beats saying nothing. */
    const reason = choice.finish_reason || choice.native_finish_reason || "unknown";
    const thought = choice.message?.reasoning?.length || 0;
    const detail =
      reason === "length"
        ? `the ${MAX_TOKENS}-token budget ran out${
            thought ? ` after ${thought} characters of reasoning` : ""
          }. Raise RBC_MAX_TOKENS, or set RBC_REASONING=none.`
        : `finish_reason was "${reason}".`;
    throw new Error(`${model} returned an empty message — ${detail}`);
  }

  /* Content that stopped because the budget ran out is advice with its end
   * missing, and the end is where the caveats live. Say so rather than letting
   * a sentence trail off and be read as the whole answer. */
  const finish = choice.finish_reason || choice.native_finish_reason || null;

  return {
    text,
    model: payload.model || model,
    usage: payload.usage || null,
    reasoningTokens: payload.usage?.completion_tokens_details?.reasoning_tokens ?? null,
    truncated: finish === "length",
  };
}

module.exports = { ask, DEFAULT_MODEL, MAX_TOKENS, REASONING_EFFORT, EFFORTS, applyReasoning, ENDPOINT };
