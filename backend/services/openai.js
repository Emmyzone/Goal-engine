/**
 * Thin wrapper around the Google Gemini API (gemini-2.5-flash).
 * Maintains the exact same function signature so the rest of the app doesn't need to change.
 */
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash'; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

class EngineOutputError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = 'EngineOutputError';
    this.raw = raw;
  }
}

/**
 * Call the model and require a single JSON object as the response.
 */
async function getStructuredCompletion({ systemPrompt, messages, temperature = 0.4 }) {
  if (!GEMINI_API_KEY) {
    throw new EngineOutputError('GEMINI_API_KEY is not configured on the server.');
  }

  // Map OpenAI-style messages into Gemini's contents format
  const contents = [];
  
  // Add system instruction context into the first user message or prompt flow
  let combinedPrompt = systemPrompt + "\n\nConversation History:\n";
  for (const msg of messages) {
    combinedPrompt += `${msg.role}: ${msg.content}\n`;
  }

  contents.push({
    parts: [{ text: combinedPrompt }]
  });

  const payload = {
    contents,
    generationConfig: {
      temperature,
      responseMimeType: "application/json"
    }
  };

  const raw = await callGemini(payload);
  const parsed = tryParseJson(raw);
  if (parsed) return parsed;

  // Retry once with a strict reminder if first response wasn't valid JSON
  contents.push({
    parts: [{ text: "Your previous response was not valid JSON. Respond again with ONLY a single valid JSON object." }]
  });

  const retryPayload = {
    contents,
    generationConfig: {
      temperature,
      responseMimeType: "application/json"
    }
  };

  const retryRaw = await callGemini(retryPayload);
  const retryParsed = tryParseJson(retryRaw);
  if (retryParsed) return retryParsed;

  throw new EngineOutputError('Model did not return valid JSON after retry.', retryRaw);
}

async function callGemini(payload) {
  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || 'Gemini API request failed');
  }

  // Extract text from Gemini response structure
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function tryParseJson(str) {
  if (!str) return null;
  try {
    // Clean potential markdown code blocks if the model wrapped output
    const cleaned = str.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}

module.exports = {
  getStructuredCompletion,
  EngineOutputError
};
