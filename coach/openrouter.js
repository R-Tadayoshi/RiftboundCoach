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
 * The cap is not what you pay — usage is — so it is set well clear of both. */
const MAX_TOKENS = Number(process.env.RBC_MAX_TOKENS || 2000);

/* Enough thought to check its arithmetic, not so much that advice arrives
 * after the turn is over. "none" for the fastest possible answer on models
 * that allow it; "medium" or "high" to let it work harder. */
const REASONING_EFFORT = process.env.RBC_REASONING || "low";

async function ask({ system, user, model = DEFAULT_MODEL, apiKey = process.env.OPENROUTER_API_KEY }) {
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Export it (or `set` it on Windows), or run with --dry-run to see the prompt without sending it."
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
  if (REASONING_EFFORT !== "off") body.reasoning = { effort: REASONING_EFFORT };

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
          }. Raise RBC_MAX_TOKENS, or set RBC_REASONING=off.`
        : `finish_reason was "${reason}".`;
    throw new Error(`${model} returned an empty message — ${detail}`);
  }

  return {
    text,
    model: payload.model || model,
    usage: payload.usage || null,
    reasoningTokens: payload.usage?.completion_tokens_details?.reasoning_tokens ?? null,
  };
}

module.exports = { ask, DEFAULT_MODEL, MAX_TOKENS, REASONING_EFFORT, ENDPOINT };
