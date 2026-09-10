const { getStructuredCompletion } = require('../services/openai');
const { buildFeasibilityPrompt } = require('../prompts/feasibilityPrompt');
const { runWithLogging } = require('./engineRunLogger');

async function assessFeasibility({ goalId, clarifiedGoal, deadlineDays, reality }) {
  const systemPrompt = buildFeasibilityPrompt({ clarifiedGoal, deadlineDays, reality });

  return runWithLogging('feasibilityEngine', goalId, clarifiedGoal, () =>
    getStructuredCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: 'Generate the feasibility assessment now.' }],
    })
  );
}

module.exports = { assessFeasibility };
