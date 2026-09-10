const { getStructuredCompletion } = require('../services/openai');
const { buildGoalInterviewPrompt } = require('../prompts/goalPrompt');
const { runWithLogging } = require('./engineRunLogger');

/**
 * Runs one step of the adaptive interview: given the raw goal and everything
 * asked/answered so far, decide either the next question or that the
 * interview is complete.
 */
async function nextInterviewStep({ goalId, rawGoal, category, priorMessages }) {
  const systemPrompt = buildGoalInterviewPrompt({ rawGoal, category, priorMessages });

  const messages = priorMessages.map((m) => ({
    role: m.role === 'ai' ? 'assistant' : 'user',
    content: m.content,
  }));

  return runWithLogging('goalEngine', goalId, rawGoal, () =>
    getStructuredCompletion({ systemPrompt, messages })
  );
}

module.exports = { nextInterviewStep };
