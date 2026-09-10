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

// POST /api/interview/start { goal_id }
router.post('/start', async (req, res) => {
  try {
    const { goal_id } = req.body;
    if (!goal_id) return res.status(400).json({ error: 'goal_id is required.' });
    if (!(await assertOwnership(goal_id, req.user.id))) {
      return res.status(404).json({ error: 'Goal not found.' });
    }

    const step = await orchestrator.advanceInterview({ goalId: goal_id });
    res.json(step);
  } catch (err) {
    handleEngineError(err, res);
  }
});

// POST /api/interview/message { goal_id, answer }
router.post('/message', async (req, res) => {
  try {
    const { goal_id, answer } = req.body;
    if (!goal_id || !answer) {
      return res.status(400).json({ error: 'goal_id and answer are required.' });
    }
    if (!(await assertOwnership(goal_id, req.user.id))) {
      return res.status(404).json({ error: 'Goal not found.' });
    }

    await orchestrator.recordInterviewAnswer({ goalId: goal_id, answer });
    const step = await orchestrator.advanceInterview({ goalId: goal_id });
    res.json(step);
  } catch (err) {
    handleEngineError(err, res);
  }
});

function handleEngineError(err, res) {
  if (err instanceof EngineOutputError) {
    return res.status(502).json({
      error:
        'Goal Engine is temporarily unable to complete this analysis. Your information has been saved. Please try again.',
    });
  }
  res.status(500).json({ error: err.message || 'Unexpected error.' });
}

module.exports = router;
