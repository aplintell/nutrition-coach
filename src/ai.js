// Everything the app asks Claude. Bundled with the Anthropic SDK by esbuild into
// www/js/ai.bundle.js (npm run build:ai), which exposes it as window.NutritionAI.
//
// Each request (meal, targets, plan, labs) is built once and used in one of three ways:
// - API mode: sent straight to Anthropic with the user's own API key (paid per use). Requests go
//   from the phone to Anthropic, which is why the SDK's browser guard is switched off.
// - Claude app mode (free with a Claude Pro plan): manualRequest() turns it into a question,
//   with photos, that the user shares to the official Claude app; the reply, copied back, is
//   checked by parseManualReply() against the same schema.
// - Gemini mode (free with a Google AI Studio key): askGemini() sends the same question to Gemini
//   and checks its JSON reply the same way.
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
  tests: z.array(z.object({
    type: z.enum(['blood', 'urine', 'other']),
    name: z.string(),
    value: z.string(),
    unit: z.string(),
    reference_range: z.string(),
    date: z.string().nullable()
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

// Each builder returns { images: [base64 JPEG...], text, schema, effort, template, hints }.
// template / hints describe the reply shape for the Claude app, which has no schema enforcement.

const ZERO_NUTRIENTS = Object.fromEntries(NUTRIENTS.map((n) => [n.key, 0]));

function mealRequest({ imageBase64, note, profile, labs, eatenToday, now }) {
  return {
    images: imageBase64 ? [imageBase64] : [],
    schema: MealResult,
    effort: 'medium',
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
    ].join('\n'),
    template: {
      is_food: true,
      meal_name: '...',
      items: [{ name: '...', portion: '...', grams: 0 }],
      nutrients: ZERO_NUTRIENTS,
      confidence: 'medium',
      comment: '...',
      warnings: ['...']
    },
    hints: 'confidence is one of: low, medium, high.'
  };
}

function targetsRequest({ profile, labs, today }) {
  return {
    images: [],
    schema: TargetsResult,
    effort: 'high',
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
    ].join('\n'),
    template: {
      targets: Object.fromEntries(NUTRIENTS.map((n) => [n.key, { min: 0, max: null }])),
      explanation: '...',
      lab_flags: [{ test: '...', status: 'high', advice: '...' }]
    },
    hints: 'Every nutrient key must be present in targets. min and max are numbers or null. status is one of: low, normal, high, unclear.'
  };
}

function planRequest({ profile, labs, targets, meals, totals, now }) {
  return {
    images: [],
    schema: PlanResult,
    effort: 'high',
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
    ].join('\n'),
    template: {
      summary: '...',
      lacking: [{ nutrient_key: 'fiber_g', amount_left: 0, note: '...' }],
      excess: [{ nutrient_key: 'sodium_mg', over_by: 0, note: '...' }],
      plan: [{ meal: '...', dishes: [{ name: '...', portion: '...' }], why: '...' }],
      tips: ['...']
    },
    hints: 'nutrient_key must be one of the nutrient keys listed above. Use empty lists where nothing applies.'
  };
}

function labsRequest({ imagesBase64 }) {
  const count = imagesBase64.length;
  return {
    images: imagesBase64,
    schema: LabsResult,
    effort: 'medium',
    text: [
      count === 1
        ? 'This is a photo or phone screenshot of a medical lab report (blood and/or urine tests), probably in Vietnamese.'
        : `These ${count} images are photos or phone screenshots (e.g. of a clinic's app) of one or more medical lab reports (blood and/or urine tests), probably in Vietnamese.`,
      'Copy every test result exactly as printed: the test name (keep the report\'s name, add the common Vietnamese/English name in brackets if it is an abbreviation), the value as printed (including words such as Negative or Norm), the unit, and the reference range as printed.',
      'reference_range: as printed; if none is shown but the value is visibly marked abnormal (red colour, H/L, arrow, star), write "flagged abnormal on report"; otherwise an empty string.',
      'type: blood, urine, or other — use the section headings (e.g. "Nước tiểu" = urine; "Huyết học", "Tiểu đường", "Chức năng thận/gan", "Mỡ máu", "Cơ xương khớp", "Dấu ấn ung thư" = blood). Vietnamese dates are day first (01.10.2026 = 2026-10-01).',
      'date: the sampling/report date of the report that result is on, as YYYY-MM-DD, or null if not shown.',
      'Screenshots of a scrolling screen overlap: if the same result (same name and same type) from the same report appears on more than one image, list it once. A test with the same name in a different section (e.g. blood Glucose and urine Glucose) is a separate result.',
      'Do not invent values. If something is unreadable, leave it out.'
    ].join('\n'),
    template: {
      tests: [{ type: 'blood', name: '...', value: '...', unit: '...', reference_range: '...', date: 'YYYY-MM-DD' }]
    },
    hints: 'type is one of: blood, urine, other. date is "YYYY-MM-DD" or null. value is always a string.'
  };
}

const BUILDERS = { meal: mealRequest, targets: targetsRequest, plan: planRequest, labs: labsRequest };
const SCHEMAS = { meal: MealResult, targets: TargetsResult, plan: PlanResult, labs: LabsResult };

// ---- API mode ----

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

function imageBlock(base64Jpeg) {
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Jpeg } };
}

async function ask(apiKey, request) {
  let message;
  try {
    message = await client(apiKey).beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content: request.images.map(imageBlock).concat([{ type: 'text', text: request.text }]) }],
      output_config: { effort: request.effort, format: betaZodOutputFormat(request.schema) },
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

/** Estimates what's in a meal photo (and/or a typed description) before it's eaten. */
export function analyzeMeal(args) {
  return ask(args.apiKey, mealRequest(args));
}

/** Personal daily targets (min / max per nutrient) from the profile and lab results. */
export function computeTargets(args) {
  return ask(args.apiKey, targetsRequest(args));
}

/** What's missing or too much so far today, and what to eat for the rest of the day. */
export function planRestOfDay(args) {
  return ask(args.apiKey, planRequest(args));
}

/**
 * Reads photos of blood / urine test reports (several pages, possibly several reports) into one
 * list of results for the user to check.
 */
export function readLabReport(args) {
  return ask(args.apiKey, labsRequest(args));
}

// ---- Claude app mode ----

/**
 * The question to share to the Claude app for request kind ('meal' | 'targets' | 'plan' | 'labs'):
 * { text, images }. The text asks for the reply as one JSON block in a fixed shape.
 */
export function manualRequest(kind, args) {
  const request = BUILDERS[kind](args);
  const text = [
    '📋 Yêu cầu từ ứng dụng "Dinh Dưỡng Của Tôi". Hãy làm theo hướng dẫn và trả lời bằng đúng một khối JSON.',
    '',
    SYSTEM,
    '',
    request.images.length ? `(${request.images.length} photo(s) attached.)` : '',
    request.text,
    '',
    'REPLY FORMAT — important: reply with ONLY one ```json code block and nothing else.',
    replyShape(request)
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
  return { text, images: request.images };
}

// The JSON shape a reply must have, for the Claude app and Gemini (neither gets the zod schema).
function replyShape(request) {
  return [
    'Use exactly this shape and these keys, replacing the placeholder values with real ones (numbers as plain numbers, no units inside numbers):',
    '```json',
    JSON.stringify(request.template),
    '```',
    request.hints
  ].join('\n');
}

function extractJson(reply) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  const body = fenced ? fenced[1] : reply;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new AiError('Không thấy kết quả JSON trong nội dung đã dán. Hãy sao chép toàn bộ câu trả lời của Claude rồi dán lại.');
  }
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch (e) {
    throw new AiError('Nội dung đã dán bị thiếu hoặc lỗi (có thể chưa sao chép hết). Hãy sao chép lại toàn bộ câu trả lời.');
  }
}

function toNumber(v, fallback) {
  if (typeof v === 'number' && isFinite(v)) {
    return v;
  }
  const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : fallback;
}

// Maps a value to one of the allowed words (e.g. a Vietnamese "máu" to "blood"), else the fallback.
function oneOf(value, patterns, fallback) {
  const text = String(value || '');
  return Object.keys(patterns).find((key) => key === text || patterns[key].test(text)) || fallback;
}

// The Claude app has no schema enforcement, so tolerate small slips (numbers as text, a missing
// nutrient) before checking the reply against the schema.
const TIDY = {
  meal(d) {
    d.nutrients = Object.fromEntries(NUTRIENTS.map((n) => [n.key, toNumber(d.nutrients && d.nutrients[n.key], 0)]));
    d.items = (d.items || []).map((i) => Object.assign({}, i, { grams: toNumber(i.grams, 0) }));
    d.warnings = d.warnings || [];
    d.comment = d.comment || '';
    if (d.is_food === undefined) {
      d.is_food = d.items.length > 0;
    }
    d.confidence = oneOf(d.confidence, { low: /low|thấp/i, high: /high|cao/i }, 'medium');
  },
  targets(d) {
    const t = d.targets || {};
    d.targets = Object.fromEntries(NUTRIENTS.map((n) => [n.key, {
      min: t[n.key] ? toNumber(t[n.key].min, null) : null,
      max: t[n.key] ? toNumber(t[n.key].max, null) : null
    }]));
    d.lab_flags = (d.lab_flags || []).map((f) => Object.assign({}, f, {
      status: oneOf(f.status, { low: /low|thấp/i, high: /high|cao/i, normal: /normal|bình thường/i }, 'unclear')
    }));
    d.explanation = d.explanation || '';
  },
  plan(d) {
    d.lacking = (d.lacking || []).map((x) => Object.assign({}, x, { amount_left: toNumber(x.amount_left, 0), note: x.note || '' }));
    d.excess = (d.excess || []).map((x) => Object.assign({}, x, { over_by: toNumber(x.over_by, 0), note: x.note || '' }));
    d.plan = d.plan || [];
    d.tips = d.tips || [];
    d.summary = d.summary || '';
  },
  labs(d) {
    d.tests = (d.tests || []).map((t) => Object.assign({}, t, {
      type: oneOf(t.type, { blood: /blood|máu/i, urine: /urine|tiểu/i }, 'other'),
      value: String(t.value === undefined || t.value === null ? '' : t.value),
      unit: t.unit || '',
      reference_range: t.reference_range || '',
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : null
    }));
  }
};

/** Checks a reply copied from the Claude app; resolves to the same result as the API mode. */
export function parseManualReply(kind, reply) {
  const data = extractJson(reply || '');
  TIDY[kind](data);
  const checked = SCHEMAS[kind].safeParse(data);
  if (!checked.success) {
    throw new AiError('Câu trả lời của Claude không đúng mẫu. Hãy nhắn Claude "trả lời lại đúng mẫu JSON" rồi sao chép và dán lại.');
  }
  return checked.data;
}

// ---- Gemini mode ----

// Free with a Google AI Studio key (daily limits). "gemini-flash-latest" follows Google's newest
// Flash model; the fixed name is a fallback in case the alias is unavailable.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];

function geminiError(status, message) {
  if (status === 400 && /api key/i.test(message) || status === 401 || status === 403) {
    return new AiError('Gemini API key không đúng hoặc chưa được bật. Kiểm tra lại trong Cài đặt.');
  }
  if (status === 429) {
    return new AiError('Đã hết lượt miễn phí của Gemini (giới hạn mỗi phút/mỗi ngày). Đợi một lát hoặc mai thử lại.');
  }
  if (status >= 500) {
    return new AiError('Gemini đang bận hoặc gặp lỗi (' + status + '). Thử lại sau ít phút.');
  }
  return new AiError('Gemini từ chối yêu cầu: ' + (message || 'lỗi ' + status));
}

async function callGemini(apiKey, model, body) {
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body)
    });
  } catch (err) {
    throw new AiError('Không kết nối được tới Gemini. Kiểm tra mạng rồi thử lại.');
  }
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

/**
 * Asks Gemini for request kind ('meal' | 'targets' | 'plan' | 'labs') with the user's free Google
 * key. Gemini gets the same question as the Claude app and its JSON reply goes through the same
 * checks, so the result is the same shape as in the other modes.
 */
export async function askGemini(kind, args) {
  if (!args.apiKey) {
    throw new AiError('Chưa có Gemini API key. Vào Cài đặt để nhập key (miễn phí tại aistudio.google.com).');
  }
  const request = BUILDERS[kind](args);
  const body = {
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents: [{
      role: 'user',
      parts: request.images.map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } }))
        .concat([{ text: request.text + '\n\nReply with only the JSON object. ' + replyShape(request) }])
    }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 16000 }
  };
  let answer;
  for (const model of GEMINI_MODELS) {
    answer = await callGemini(args.apiKey, model, body);
    if (answer.status !== 404) {
      break;
    }
  }
  const { status, data } = answer;
  if (status !== 200) {
    throw geminiError(status, data.error && data.error.message);
  }
  const candidate = (data.candidates || [])[0];
  if (!candidate || data.promptFeedback && data.promptFeedback.blockReason) {
    throw new AiError('Gemini không trả lời yêu cầu này. Thử chụp lại hoặc ghi chú rõ hơn.');
  }
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new AiError('Câu trả lời của Gemini bị cắt ngắn. Thử lại (với ít ảnh hơn).');
  }
  const text = ((candidate.content && candidate.content.parts) || [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('');
  try {
    return { result: parseManualReply(kind, text), costUsd: 0 };
  } catch (err) {
    throw new AiError('Câu trả lời của Gemini bị lỗi định dạng. Thử lại.');
  }
}
