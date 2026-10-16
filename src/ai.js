// Everything the app asks Claude. Bundled with the Anthropic SDK by esbuild into
// www/js/ai.bundle.js (npm run build:ai), which exposes it as window.NutritionAI.
//
// The API key is the user's own, typed into Settings and kept on the phone; requests go
// straight from the phone to Anthropic, which is why the SDK's browser guard is switched off.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { NUTRIENTS } from './nutrients.js';

export { NUTRIENTS };

const MODEL = 'claude-opus-5-5';
// Price per million tokens for MODEL, used only to show the user roughly what each request cost.
const PRICE_IN = 4;
const PRICE_OUT = 20;

// ---- Response shapes ----

const NutrientAmounts = z.object(Object.fromEntries(NUTRIENTS.map((n) => [n.key, z.number()])));

const NutrientRanges = z.object(Object.fromEntries(NUTRIENTS.map((n) => [n.key, z.object({
  min: z.number().nullable(),
  max: z.number().nullable()
})])));

const MealResult = z.object({
  is_food: z.boolean(),
  meal_name: z.string(),
  items: z.array(z.object({ name: z.string(), portion: z.string(), grams: z.number() })),
  nutrients: NutrientAmounts,
  confidence: z.enum(['low', 'medium', 'high']),
  comment: z.string(),
  warnings: z.array(z.string())
});

const TargetsResult = z.object({
  targets: NutrientRanges,
  explanation: z.string(),
  lab_flags: z.array(z.object({
    test: z.string(),
    status: z.enum(['low', 'normal', 'high', 'unclear']),
    advice: z.string()
  }))
});

const PlanResult = z.object({
  summary: z.string(),
  lacking: z.array(z.object({ nutrient_key: z.string(), amount_left: z.number(), note: z.string() })),
  excess: z.array(z.object({ nutrient_key: z.string(), over_by: z.number(), note: z.string() })),
  plan: z.array(z.object({
    meal: z.string(),
    dishes: z.array(z.object({ name: z.string(), portion: z.string() })),
    why: z.string()
  })),
  tips: z.array(z.string())
});

const LabsResult = z.object({
  test_date: z.string().nullable(),
  tests: z.array(z.object({
    type: z.enum(['blood', 'urine', 'other']),
    name: z.string(),
    value: z.string(),
    unit: z.string(),
    reference_range: z.string()
  }))
});

// ---- Prompts ----

const NUTRIENT_LIST = NUTRIENTS.map((n) => `${n.key} (${n.name}, ${n.unit})`).join(', ');

const SYSTEM = `You are the nutrition assistant inside a personal Android app used by one person in Vietnam.
Always write every text field in natural Vietnamese, short and practical. Prefer Vietnamese dishes and foods that are easy to buy in Vietnam.
Nutrient keys and units: ${NUTRIENT_LIST}.
Use standard food-composition knowledge (Vietnamese food composition tables, USDA) for estimates. All amounts are numbers in the unit named by the key; use 0 when a food has none of a nutrient.
Take the person's health profile and lab results seriously (for example high uric acid → watch purines; high glucose/HbA1c → watch sugar and refined carbs; high LDL → watch saturated fat; kidney markers → watch protein, potassium, phosphorus, sodium).
You are not a doctor: when a lab value or a pattern looks medically significant, say so briefly and suggest seeing a doctor, without being alarmist.`;

function describeProfile(profile, labs) {
  const labLines = (labs || []).map((t) => `- [${t.type}] ${t.name}: ${t.value} ${t.unit || ''}`.trim()
    + (t.reference_range ? ` (khoảng tham chiếu ${t.reference_range})` : '') + (t.date ? ` — ngày ${t.date}` : ''));
  return [
    'Health profile:',
    JSON.stringify(profile || {}, null, 1),
    'Lab results (blood / urine):',
    labLines.length ? labLines.join('\n') : '(none entered)'
  ].join('\n');
}

// ---- Calling Claude ----

function client(apiKey) {
  if (!apiKey) {
    throw new AiError('Chưa có API key. Vào Cài đặt để nhập API key của Anthropic.');
  }
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

export class AiError extends Error {}

// Turns SDK errors into messages the user can act on.
function explain(err) {
  if (err instanceof AiError) {
    return err;
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AiError('API key không đúng hoặc đã bị khóa. Kiểm tra lại trong Cài đặt.');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError('Gửi quá nhiều yêu cầu hoặc tài khoản hết hạn mức. Đợi một lát rồi thử lại.');
  }
  if (err instanceof Anthropic.BadRequestError) {
    const credit = /credit|billing|balance/i.test(err.message || '');
    return new AiError(credit
      ? 'Tài khoản Anthropic hết tiền (credit). Nạp thêm tại console.anthropic.com.'
      : 'Yêu cầu bị từ chối: ' + (err.message || 'lỗi không rõ'));
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError('Không kết nối được tới Claude. Kiểm tra mạng rồi thử lại.');
  }
  if (err instanceof Anthropic.APIError) {
    return new AiError('Claude đang bận hoặc gặp lỗi (' + (err.status || '?') + '). Thử lại sau ít phút.');
  }
  return new AiError('Lỗi: ' + (err && err.message ? err.message : String(err)));
}

async function ask(apiKey, { content, schema, effort }) {
  let message;
  try {
    message = await client(apiKey).beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { effort, format: betaZodOutputFormat(schema) },
      // If a safety check declines the request, Anthropic re-runs it on its default fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default'
    });
  } catch (err) {
    throw explain(err);
  }
  if (message.stop_reason === 'refusal') {
    throw new AiError('Claude không trả lời yêu cầu này. Thử chụp lại hoặc ghi chú rõ hơn.');
  }
  if (message.stop_reason === 'max_tokens' || !message.parsed_output) {
    throw new AiError('Câu trả lời của Claude bị lỗi định dạng. Thử lại.');
  }
  const usage = message.usage || {};
  const inputTokens = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  const costUsd = (inputTokens * PRICE_IN + (usage.output_tokens || 0) * PRICE_OUT) / 1e6;
  return { result: message.parsed_output, costUsd };
}

function imageBlock(base64Jpeg) {
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Jpeg } };
}

/** Estimates what's in a meal photo (and/or a typed description) before it's eaten. */
export async function analyzeMeal({ apiKey, imageBase64, note, profile, labs, eatenToday, now }) {
  const content = [];
  if (imageBase64) {
    content.push(imageBlock(imageBase64));
  }
  content.push({
    type: 'text',
    text: [
      describeProfile(profile, labs),
      '',
      `Current local time: ${now}.`,
      'Already eaten today (nutrient totals, before this meal):',
      JSON.stringify(eatenToday || {}),
      '',
      imageBase64 ? 'The photo shows the meal the person is about to eat.' : 'There is no photo; rely on the description.',
      note ? `The person's note about the meal: "${note}"` : 'No note.',
      '',
      'Identify each food and drink, estimate realistic portions in grams (use plates, bowls and hands in the photo for scale), and estimate the nutrients of the WHOLE meal.',
      'If the photo is not food, set is_food to false, items to an empty list and every nutrient to 0.',
      'meal_name: a short Vietnamese name for the meal. confidence: how sure you are about the portions.',
      'comment: 1-3 sentences on how this meal fits this person today (considering their profile, labs and what they already ate).',
      'warnings: specific concerns for this person (e.g. high purine with high uric acid); empty list if none.'
    ].join('\n')
  });
  return ask(apiKey, { content, schema: MealResult, effort: 'medium' });
}

/** Personal daily targets (min / max per nutrient) from the profile and lab results. */
export async function computeTargets({ apiKey, profile, labs, today }) {
  return ask(apiKey, {
    effort: 'high',
    schema: TargetsResult,
    content: [{
      type: 'text',
      text: [
        describeProfile(profile, labs),
        '',
        `Today's date: ${today}.`,
        'Set this person\'s personal DAILY nutrient targets. For every nutrient key give:',
        '- min: the amount to reach each day (recommended intake), or null when there is no minimum (e.g. sugar, sodium, cholesterol, purine, saturated fat);',
        '- max: the most they should have in a day (upper limit, or a lower medical limit when their labs or conditions call for it), or null when there is no meaningful maximum.',
        'Base energy on age, sex, height, weight, activity and goal. Adjust for their lab results and conditions.',
        'explanation: a short Vietnamese explanation of the main choices (energy, and anything changed because of labs/conditions).',
        'lab_flags: one entry per lab result that is outside its normal range or worth attention, with simple dietary advice; empty list if none.'
      ].join('\n')
    }]
  });
}

/** What's missing or too much so far today, and what to eat for the rest of the day. */
export async function planRestOfDay({ apiKey, profile, labs, targets, meals, totals, now }) {
  return ask(apiKey, {
    effort: 'high',
    schema: PlanResult,
    content: [{
      type: 'text',
      text: [
        describeProfile(profile, labs),
        '',
        'Daily targets (min / max per nutrient key):',
        JSON.stringify(targets),
        '',
        `Current local time: ${now}.`,
        'Meals eaten so far today:',
        (meals || []).map((m) => `- ${m.time} ${m.name}: ${m.items}`).join('\n') || '(none yet)',
        'Totals so far:',
        JSON.stringify(totals),
        '',
        'summary: 2-4 Vietnamese sentences on how the day is going.',
        'lacking: nutrients still clearly below their min (amount_left in the nutrient\'s unit), most important first. Skip trivial gaps.',
        'excess: nutrients already over their max (over_by in the nutrient\'s unit), or close enough that the rest of the day must avoid them.',
        'plan: the remaining meals/snacks for TODAY ONLY that fit the time left (no breakfast if it is evening; nothing heavy late at night), with concrete Vietnamese dishes and portions that fill the gaps without adding to the excesses. why: one sentence each.',
        'tips: up to 3 short practical tips (drinks, what to avoid tonight, etc.).'
      ].join('\n')
    }]
  });
}

/** Reads a photo of a blood / urine test report into a list of results for the user to check. */
export async function readLabReport({ apiKey, imageBase64 }) {
  return ask(apiKey, {
    effort: 'medium',
    schema: LabsResult,
    content: [imageBlock(imageBase64), {
      type: 'text',
      text: [
        'This is a photo of a medical lab report (blood and/or urine tests), probably in Vietnamese.',
        'Copy every test result exactly as printed: the test name (keep the report\'s name, add the common Vietnamese/English name in brackets if it is an abbreviation), the value as printed, the unit, and the reference range as printed (empty string if none).',
        'type: blood, urine, or other. test_date: the sampling/report date as YYYY-MM-DD, or null if not shown.',
        'Do not invent values. If something is unreadable, leave it out.'
      ].join('\n')
    }]
  });
}
