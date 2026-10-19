// The Claude call behind the judge.

import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { OUTPUT_SCHEMA, phrasesMessage, SYSTEM_PROMPT } from "../_shared/judgePrompt.ts";
import type { JudgeEntry, ModelVerdict, Usage } from "./judge.ts";

export { PROMPT_VERSION } from "../_shared/judgePrompt.ts";

export const MODEL = "claude-haiku-5-5";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

export { Anthropic };

export async function callModel(
  entries: JudgeEntry[],
): Promise<{ verdicts: ModelVerdict[]; usage: Usage }> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    // The instructions are identical on every call, so cache them.
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: phrasesMessage(entries) }],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
  });

  if (response.stop_reason === "refusal") throw new Error("judge refused the request");
  if (response.stop_reason === "max_tokens") throw new Error("judge ran out of tokens");
  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") throw new Error("judge returned no text");

  return {
    verdicts: (JSON.parse(text.text) as { verdicts: ModelVerdict[] }).verdicts,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
