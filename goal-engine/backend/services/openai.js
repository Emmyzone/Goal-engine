/**
 * Thin wrapper around the OpenAI Chat Completions API.
 *
 * All AI engines in Goal Engine call `getStructuredCompletion`, which:
 *  - forces JSON-only output
 *  - parses and validates the JSON
 *  - retries once on malformed output
 *  - throws a normalized error the orchestrator can catch and handle gracefully
 */
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

class EngineOutputError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = 'EngineOutputError';
    this.raw = raw;
  }
}

/**
 * Call the model and require a single JSON object as the response.
 *
 * @param {Object} opts
 * @param {string} opts.systemPrompt - instructions, must tell the model to return ONLY JSON
 * @param {Array<{role: 'user'|'assistant', content: string}>} opts.messages - conversation so far
 * @param {number} [opts.temperature]
 * @returns {Promise<Object>} parsed JSON object
 */
async function getStructuredCompletion({ systemPrompt, messages, temperature = 0.4 }) {
  if (!OPENAI_API_KEY) {
    throw new EngineOutputError('OPENAI_API_KEY is not configured on the server.');
  }

  const payload = {
    model: OPENAI_MODEL,
    temperature,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
  };

  const raw = await callOpenAI(payload);
  const parsed = tryParseJson(raw);
  if (parsed) return parsed;

  // Retry once with a stricter reminder if the first response was malformed.
  const retryPayload = {
    ...payload,
    messages: [
      ...payload.messages,
      {
        role: 'user',
        content:
          'Your previous response was not valid JSON. Respond again with ONLY a single valid JSON object and nothing else.',
      },
    ],
  };
  const retryRaw = await callOpenAI(retryPayload);
  const retryParsed = tryParseJson(retryRaw);
  if (retryParsed) return retryParsed;

  throw new EngineOutputError('Model did not return valid JSON after retry.', retryRaw);
}

async function callOpenAI(payload) {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new EngineOutputError(`OpenAI request failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new EngineOutputError('OpenAI response had no content.', data);
  }
  return content;
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
