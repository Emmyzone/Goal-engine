const { getStructuredCompletion } = require('../services/openai');
const { buildRealityPrompt } = require('../prompts/realityPrompt');
const { runWithLogging } = require('./engineRunLogger');

async function assessReality({ goalId, clarifiedGoal, category, interviewTranscript }) {
  const systemPrompt = buildRealityPrompt({ clarifiedGoal, category, interviewTranscript });

  return runWithLogging('realityEngine', goalId, clarifiedGoal, () =>
    getStructuredCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: 'Generate the reality assessment now.' }],
    })
  );
}

module.exports = { assessReality };
