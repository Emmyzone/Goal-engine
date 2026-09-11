const express = require('express');
const { query } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const orchestrator = require('../engines/orchestrator');
const { EngineOutputError } = require('../services/openai');

const router = express.Router();
router.use(requireAuth);

// POST /api/system { goal_id } - builds strategy+system if not already built, returns the system + actions
router.post('/', async (req, res) => {
  try {
    const { goal_id } = req.body;
    if (!goal_id) return res.status(400).json({ error: 'goal_id is required.' });

    const owns = await query('SELECT id FROM goals WHERE id = $1 AND user_id = $2', [goal_id, req.user.id]);
    if (owns.rows.length === 0) return res.status(404).json({ error: 'Goal not found.' });

    const existing = await query(
      'SELECT * FROM systems WHERE goal_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
      [goal_id]
    );
    if (existing.rows.length > 0) {
      const actions = await query('SELECT * FROM actions WHERE system_id = $1 AND is_active = true', [
        existing.rows[0].id,
      ]);
      return res.json({ system: existing.rows[0], actions: actions.rows });
    }

    const result = await orchestrator.runStrategyAndSystem({ goalId: goal_id });
    res.json({ system: result.system, actions: result.actions });
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
