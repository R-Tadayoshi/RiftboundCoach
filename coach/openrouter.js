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

async function ask({ system, user, model = DEFAULT_MODEL, apiKey = process.env.OPENROUTER_API_KEY }) {
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Export it, or run with --dry-run to see the prompt without sending it."
    );
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "x-title": "Riftbound Coach",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 400,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    // The body carries the reason (bad key, unknown model, no credit) and the
    // status alone does not.
    throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const body = await res.json();
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter returned no message");
  return { text, model: body.model || model, usage: body.usage || null };
}

module.exports = { ask, DEFAULT_MODEL, ENDPOINT };
