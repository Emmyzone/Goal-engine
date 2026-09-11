const express = require('express');
const { query } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const orchestrator = require('../engines/orchestrator');
const { EngineOutputError } = require('../services/gemini');

const router = express.Router();
router.use(requireAuth);

// POST /api/strategy { goal_id } - reuses an existing strategy if one was already built
router.post('/', async (req, res) => {
  try {
    const { goal_id } = req.body;
    if (!goal_id) return res.status(400).json({ error: 'goal_id is required.' });

    const owns = await query('SELECT id FROM goals WHERE id = $1 AND user_id = $2', [goal_id, req.user.id]);
    if (owns.rows.length === 0) return res.status(404).json({ error: 'Goal not found.' });

    const existing = await query(
      'SELECT * FROM strategies WHERE goal_id = $1 ORDER BY created_at DESC LIMIT 1',
      [goal_id]
    );
    if (existing.rows.length > 0) return res.json(existing.rows[0]);

    // runStrategyAndSystem also builds the system; strategy alone is returned here,
    // the system is available via /api/system afterward or the same result object.
    const result = await orchestrator.runStrategyAndSystem({ goalId: goal_id });
    res.json(result.strategy);
  } catch (err) {
    if (err instanceof EngineOutputError) {
      return res.status(502).json({
        error:
          'Goal Engine is temporarily unable to complete this analysis. Your information has been saved. Please try again.',
      });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
