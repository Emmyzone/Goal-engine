const express = require('express');
const { query } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const orchestrator = require('../engines/orchestrator');
const { EngineOutputError } = require('../services/openai');

const router = express.Router();
router.use(requireAuth);

async function assertOwnership(goalId, userId) {
  const result = await query('SELECT id FROM goals WHERE id = $1 AND user_id = $2', [goalId, userId]);
  return result.rows.length > 0;
}

function handleEngineError(err, res) {
  if (err instanceof EngineOutputError) {
    return res.status(502).json({
      error:
        'Goal Engine is temporarily unable to complete this analysis. Your information has been saved. Please try again.',
    });
  }
  res.status(500).json({ error: err.message || 'Unexpected error.' });
}

// POST /api/assessment/reality { goal_id }
router.post('/reality', async (req, res) => {
  try {
    const { goal_id } = req.body;
    if (!goal_id) return res.status(400).json({ error: 'goal_id is required.' });
    if (!(await assertOwnership(goal_id, req.user.id))) return res.status(404).json({ error: 'Goal not found.' });

    const reality = await orchestrator.runRealityAssessment({ goalId: goal_id });
    res.json(reality);
  } catch (err) {
    handleEngineError(err, res);
  }
});

// POST /api/assessment/feasibility { goal_id }
router.post('/feasibility', async (req, res) => {
  try {
    const { goal_id } = req.body;
    if (!goal_id) return res.status(400).json({ error: 'goal_id is required.' });
    if (!(await assertOwnership(goal_id, req.user.id))) return res.status(404).json({ error: 'Goal not found.' });

    const feasibility = await orchestrator.runFeasibilityAssessment({ goalId: goal_id });
    res.json(feasibility);
  } catch (err) {
    handleEngineError(err, res);
  }
});

// POST /api/assessment/gaps { goal_id }
router.post('/gaps', async (req, res) => {
  try {
    const { goal_id } = req.body;
    if (!goal_id) return res.status(400).json({ error: 'goal_id is required.' });
    if (!(await assertOwnership(goal_id, req.user.id))) return res.status(404).json({ error: 'Goal not found.' });

    const gaps = await orchestrator.runGapAnalysis({ goalId: goal_id });
    res.json(gaps);
  } catch (err) {
    handleEngineError(err, res);
  }
});

module.exports = router;
