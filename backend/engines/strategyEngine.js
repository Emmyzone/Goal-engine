const { getStructuredCompletion } = require('../services/openai');
const { buildStrategyPrompt } = require('../prompts/strategyPrompt');
const { runWithLogging } = require('./engineRunLogger');

async function buildStrategy({ goalId, clarifiedGoal, reality, feasibility, gaps }) {
  const systemPrompt = buildStrategyPrompt({ clarifiedGoal, reality, feasibility, gaps });

  return runWithLogging('strategyEngine', goalId, clarifiedGoal, () =>
    getStructuredCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: 'Generate the strategy now.' }],
    })
  );
}

module.exports = { buildStrategy };
