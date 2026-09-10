const { query } = require('../services/database');

/**
 * Wraps an engine call with timing + engine_runs logging.
 * @param {string} engineName
 * @param {string|null} goalId
 * @param {string} inputSummary
 * @param {Function} fn - async function returning the structured output
 */
async function runWithLogging(engineName, goalId, inputSummary, fn) {
  const start = Date.now();
  try {
    const output = await fn();
    const duration = Date.now() - start;
    await query(
      `INSERT INTO engine_runs (goal_id, engine, status, input_summary, output, duration_ms)
       VALUES ($1, $2, 'success', $3, $4, $5)`,
      [goalId, engineName, inputSummary, output, duration]
    );
    return output;
  } catch (err) {
    const duration = Date.now() - start;
    await query(
      `INSERT INTO engine_runs (goal_id, engine, status, input_summary, error, duration_ms)
       VALUES ($1, $2, 'error', $3, $4, $5)`,
      [goalId, engineName, inputSummary, err.message, duration]
    ).catch(() => {}); // never let logging failure mask the real error
    throw err;
  }
}

module.exports = { runWithLogging };
