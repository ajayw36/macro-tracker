// Macro estimation from a meal photo and/or a written description.
//
// The image is passed straight through to Claude and then dropped — nothing
// about it is persisted. Only the numbers the user confirms are ever stored.
// Units: calories in kcal, macros in grams.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod";

// Two ways to reach Claude, resolved at call time rather than module scope so
// importing this module is safe without either key. Vercel AI Gateway speaks
// the Anthropic Messages API, so the only differences are the base URL, the
// credential, and the provider-prefixed model id — the request shape below is
// identical either way.
//
//   AI_GATEWAY_API_KEY  -> Vercel AI Gateway, billed to AI Gateway Credits
//   ANTHROPIC_API_KEY   -> Anthropic direct
//
// The gateway wins when both are set; drop AI_GATEWAY_API_KEY to fall back.
function resolveClient(): { client: Anthropic; model: string; via: string } {
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  if (gatewayKey) {
    return {
      client: new Anthropic({ apiKey: gatewayKey, baseURL: GATEWAY_BASE_URL }),
      model: modelFor("gateway"),
      via: "gateway",
    };
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return {
      client: new Anthropic({ apiKey: anthropicKey }),
      model: modelFor("anthropic"),
      via: "anthropic",
    };
  }
  throw new Error("Set AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY to estimate macros.");
}

const GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh";
/** Gateway model ids are provider-prefixed; the direct API's are not. */
const GATEWAY_MODEL = "anthropic/claude-opus-5";
const DIRECT_MODEL = "claude-opus-5";

/**
 * Override the model without touching code. Anthropic models are NOT available
 * on the AI Gateway free tier — every one returns 403 RestrictedModelsError, so
 * a free-tier team must point this at a free-tier-eligible vision model.
 * `openai/gpt-4.1-nano` is the measured pick; see .env.example for the numbers.
 */
function modelFor(via: "gateway" | "anthropic"): string {
  return process.env.NUTRITION_MODEL || (via === "gateway" ? GATEWAY_MODEL : DIRECT_MODEL);
}

/** Image types the Messages API accepts. */
const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

export function isSupportedMediaType(t: string): t is SupportedMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(t);
}

export const MealItemSchema = z.object({
  name: z.string().describe("Short name of the food, e.g. 'Grilled chicken breast'"),
  quantity: z.string().describe("Portion as a human phrase, e.g. '6 oz' or '1 cup'"),
  calories: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
});

export const MealEstimateSchema = z.object({
  name: z.string().describe("Short name for the whole meal, e.g. 'Chicken and rice bowl'"),
  items: z.array(MealItemSchema),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("How reliable this estimate is overall"),
  assumptions: z
    .array(z.string())
    .describe("Guesses made that the user may want to correct, e.g. 'assumed 1 tbsp cooking oil'"),
});

export type MealItem = z.infer<typeof MealItemSchema>;
export type MealEstimate = z.infer<typeof MealEstimateSchema>;

// Written for a small, fast model (Gemini Flash Lite class): an explicit
// numbered procedure and a hard precedence order, rather than the principles a
// frontier model can be trusted to weigh for itself. Short declarative rules,
// concrete examples, and the critical constraints repeated.
const SYSTEM_PROMPT = `You are a nutrition database assistant for a personal fitness tracker. You convert a meal into a per-ingredient macronutrient breakdown.

Follow these steps in order.

STEP 1 — IDENTIFY
List every distinct food and drink. Break composite dishes into their parts.
  "burrito" -> tortilla, rice, beans, meat, cheese, sour cream
  "caesar salad" -> romaine, parmesan, croutons, caesar dressing
Include cooking fats, oils, sauces, dressings and spreads even when you cannot see them. Most cooked food contains added fat.

CRITICAL — when you break a dish into parts, scale EVERY part to the amount actually eaten, not to the whole dish.
  "two slices of a large pizza" = 2 of 8 slices. The dough, sauce, cheese and pepperoni must EACH be one quarter of a large pizza's worth, not a whole pizza's worth.
  "half a burrito" = half the tortilla, half the rice, half the beans, half the meat.
After listing the parts, add up what they represent and ask: does this equal the amount the user said they ate? If it is larger, every part is too big. Scale them all down.

STEP 2 — SET THE PORTION
Use this precedence. A higher rule always beats a lower one.
  1. A quantity the user stated. If they say "6 oz chicken", the portion is 6 oz. Never overrule it with your own visual estimate.
  2. A nutrition label or brand the user quoted. Use those exact numbers.
  3. Visible measurement cues: plate diameter, fork or spoon width, can or bottle size.
  4. A standard single serving for that food.

STEP 3 — LOOK UP THE VALUES
Recall the published reference values for that food from authoritative nutrition data you know: USDA FoodData Central, the manufacturer's published label for a named brand, or standard restaurant nutrition disclosures. Retrieve the real reference figure per 100g or per standard serving, then scale it to the portion from Step 2.
Do not invent plausible-looking numbers. Do not round to memorable figures. If you cannot recall a specific food, use the closest food you do have reference data for, and record that substitution in "assumptions".
Sanity-check every item against these anchors:
  lean cooked meat/fish  ~40-52g protein per 6 oz
  cooked rice/pasta      ~200-220 kcal per cup
  oils and butter        ~120 kcal and ~14g fat per tbsp
  raw leafy vegetables   under 50 kcal per cup
  bread                  ~70-90 kcal per slice
An item that falls far outside its anchor is wrong. Recompute it.

STEP 4 — REPORT
Give calories, protein, carbs and fat for EACH item separately. Do NOT sum them; the application does that.
Put every guess you made in "assumptions" — added cooking fat, an assumed portion, a substituted food, an assumed preparation method.

CONFIDENCE
  high   — the user stated the portions, or quoted a label.
  medium — portions inferred from clear visual cues or standard servings.
  low    — food is obscured, ambiguous, or the preparation is unknown.

ALWAYS RETURN AN ESTIMATE. Never refuse and never return an empty list when any food is present. If the image is unclear, give your best estimate at low confidence and say what was unclear in "assumptions". Return an empty list only when the input genuinely contains no food or drink at all.`;

export interface AnalyzeInput {
  image?: { data: string; mediaType: SupportedMediaType } | null;
  description?: string | null;
}

/**
 * Ask Claude for an itemized macro breakdown. Throws on a missing key, an API
 * failure, or a response that could not be parsed into the schema.
 */
export async function analyzeMeal(input: AnalyzeInput): Promise<MealEstimate> {
  const { image, description } = input;
  if (!image && !description?.trim()) {
    throw new Error("Provide a photo, a description, or both.");
  }

  const { client, model, via } = resolveClient();

  // Image first, then text — the API performs better with the image leading.
  const content: Anthropic.ContentBlockParam[] = [];
  if (image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.data },
    });
  }
  content.push({
    type: "text",
    text: description?.trim()
      ? `Estimate the macros for this meal.\n\nWhat the user says about it:\n${description.trim()}`
      : "Estimate the macros for this meal from the photo.",
  });

  const request = () =>
    client.messages.parse({
      model,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
      output_config: {
        format: zodOutputFormat(MealEstimateSchema),
        // Portion estimation does not need deep reasoning and this sits in an
        // interactive form where latency is felt. Raise if accuracy disappoints.
        effort: "medium",
      },
    });

  let response;
  try {
    // Small models intermittently emit structured output that fails to parse
    // (observed roughly 1 in 8 on Flash Lite). It is not deterministic, so one
    // retry turns a user-facing error into a slower response.
    try {
      response = await request();
    } catch (first) {
      if (!isParseFailure(first)) throw first;
      response = await request();
    }
  } catch (err) {
    const where = via === "gateway" ? "AI Gateway" : "Anthropic";
    if (err instanceof Anthropic.AuthenticationError) {
      const which = via === "gateway" ? "AI_GATEWAY_API_KEY" : "ANTHROPIC_API_KEY";
      throw new Error(`${which} is invalid or expired.`);
    }
    if (err instanceof Anthropic.RateLimitError) {
      // The free tier applies lower per-model limits than the paid tier.
      throw new Error(`${where} rate limit hit. Try again in a moment.`);
    }
    if (err instanceof Anthropic.APIError) {
      // 402 = out of credits, 403 = the team needs a payment method on file to
      // unlock its free credits. Both are actionable, so say so plainly.
      if (err.status === 402) {
        throw new Error("Out of AI Gateway credits. Top up in the Vercel dashboard.");
      }
      if (err.status === 403 && via === "gateway") {
        // Most often RestrictedModelsError: the model isn't free-tier eligible.
        // Can also be customer_verification_required (no payment method on file).
        throw new Error(
          `AI Gateway denied this model on your tier. Buy credits, or set ` +
            `NUTRITION_MODEL to a free-tier model. (${err.message.slice(0, 120)})`,
        );
      }
      throw new Error(`${where} ${err.status}: ${err.message.slice(0, 200)}`);
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to analyze that image. Try a different photo.");
  }
  // parsed_output is null when the response did not match the schema.
  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("Could not read a macro estimate from the response. Try again.");
  }
  if (parsed.items.length === 0) {
    throw new Error("No food was identified. Add a description and try again.");
  }
  return parsed;
}

function isParseFailure(err: unknown): boolean {
  return err instanceof Error && /parse structured output/i.test(err.message);
}

/** Sum an item list into meal totals. The model is never asked to do this. */
export function sumItems(items: MealItem[]): {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  return items.reduce(
    (acc, i) => ({
      calories: acc.calories + (Number(i.calories) || 0),
      proteinG: acc.proteinG + (Number(i.proteinG) || 0),
      carbsG: acc.carbsG + (Number(i.carbsG) || 0),
      fatG: acc.fatG + (Number(i.fatG) || 0),
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}
