const { getStructuredCompletion } = require('../services/openai');
const { buildFeedbackPrompt } = require('../prompts/feedbackPrompt');
const { runWithLogging } = require('./engineRunLogger');

async function diagnoseAndAdapt({ goalId, clarifiedGoal, executionSummary, progressSummary, system }) {
  const systemPrompt = buildFeedbackPrompt({ clarifiedGoal, executionSummary, progressSummary, system });

  return runWithLogging('feedbackEngine', goalId, clarifiedGoal, () =>
    getStructuredCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: 'Generate the diagnosis and recommendation now.' }],
    })
  );
}

module.exports = { diagnoseAndAdapt };
