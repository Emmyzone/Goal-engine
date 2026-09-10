const { getStructuredCompletion } = require('../services/openai');
const { buildGapPrompt } = require('../prompts/gapPrompt');
const { runWithLogging } = require('./engineRunLogger');

async function analyzeGaps({ goalId, clarifiedGoal, reality, feasibility }) {
  const systemPrompt = buildGapPrompt({ clarifiedGoal, reality, feasibility });

  return runWithLogging('gapEngine', goalId, clarifiedGoal, () =>
    getStructuredCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: 'Generate the gap analysis now.' }],
    })
  );
}

module.exports = { analyzeGaps };
