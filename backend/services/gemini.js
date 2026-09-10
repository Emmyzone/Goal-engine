require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

class EngineOutputError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = 'EngineOutputError';
    this.raw = raw;
  }
}

async function getStructuredCompletion({ systemPrompt, messages }) {
  if (!GEMINI_API_KEY) {
    throw new EngineOutputError('GEMINI_API_KEY is not configured on the server.');
  }

  const contents = toGeminiContents(messages);

  const payload = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json',
    },
  };

  const raw = await callGemini(payload);
  const parsed = tryParseJson(raw);
  if (parsed) return parsed;

  const retryPayload = {
    ...payload,
    contents: [
      ...contents,
      { role: 'model', parts: [{ text: raw }] },
      {
        role: 'user',
        parts: [
          {
            text: 'Your previous response was not valid JSON. Respond again with ONLY a single valid JSON object and nothing else.',
          },
        ],
      },
    ],
  };
  const retryRaw = await callGemini(retryPayload);
  const retryParsed = tryParseJson(retryRaw);
  if (retryParsed) return retryParsed;

  throw new EngineOutputError('Model did not return valid JSON after retry.', retryRaw);
}

function toGeminiContents(messages) {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
}

async function callGemini(payload) {
  let response;
  try {
    response = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw new EngineOutputError('Could not reach the AI provider.');
  }

  if (response.status === 429) {
    throw new EngineOutputError(
      'The AI provider is rate-limited right now (daily or per-minute quota reached). Please try again shortly.'
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error(`Gemini request failed (${response.status}):`, errText);
    throw new EngineOutputError('The AI provider returned an error.');
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text) {
    throw new EngineOutputError('AI provider response had no content.', data);
  }
  return text;
}

function tryParseJson(text) {
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}

module.exports = { getStructuredCompletion, EngineOutputError };
