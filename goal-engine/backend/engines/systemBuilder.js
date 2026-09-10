const { getStructuredCompletion } = require('../services/openai');
const { buildSystemPrompt } = require('../prompts/systemPrompt');
const { runWithLogging } = require('./engineRunLogger');

async function buildSystem({ goalId, clarifiedGoal, reality, strategy }) {
  const systemPrompt = buildSystemPrompt({ clarifiedGoal, reality, strategy });

  return runWithLogging('systemBuilder', goalId, clarifiedGoal, () =>
    getStructuredCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: 'Build the executable system now.' }],
    })
  );
}

module.exports = { buildSystem };
