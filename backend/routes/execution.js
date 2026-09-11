const express = require('express');
const { query } = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const orchestrator = require('../engines/orchestrator');
const { EngineOutputError } = require('../services/openai');

const router = express.Router();
router.use(requireAuth);

async function assertGoalOwnership(goalId, userId) {
  const result = await query('SELECT * FROM goals WHERE id = $1 AND user_id = $2', [goalId, userId]);
  return result.rows[0] || null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/dashboard/:goalId
router.get('/dashboard/:goalId', async (req, res) => {
  try {
    const goal = await assertGoalOwnership(req.params.goalId, req.user.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found.' });

    const systemRes = await query(
      'SELECT * FROM systems WHERE goal_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
      [goal.id]
    );
    const system = systemRes.rows[0] || null;

    let todaysActions = [];
    if (system) {
      const today = todayIso();
      const actionsRes = await query(
        `SELECT a.id as action_id, a.title, a.normal_instruction, a.minimum_instruction, a.target_time,
                ai.id as instance_id, ai.status, ai.mode
         FROM actions a
         LEFT JOIN action_instances ai ON ai.action_id = a.id AND ai.scheduled_date = $2
         WHERE a.system_id = $1 AND a.cadence = 'daily' AND a.is_active = true`,
        [system.id, today]
      );
      todaysActions = actionsRes.rows;

      // Auto-create today's pending instances for daily actions that don't have one yet.
      for (const row of todaysActions) {
        if (!row.instance_id) {
          const inserted = await query(
            `INSERT INTO action_instances (action_id, scheduled_date, status) VALUES ($1,$2,'pending') RETURNING id, status, mode`,
            [row.action_id, today]
          );
          row.instance_id = inserted.rows[0].id;
          row.status = inserted.rows[0].status;
          row.mode = inserted.rows[0].mode;
        }
      }
    }

    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const execRes = await query(
      `SELECT ai.status, count(*) FROM action_instances ai
       JOIN actions a ON a.id = ai.action_id
       WHERE a.system_id = $1 AND ai.scheduled_date >= $2
       GROUP BY ai.status`,
      [system ? system.id : null, last30]
    );
    const counts = { completed: 0, skipped: 0, partial: 0, pending: 0 };
    execRes.rows.forEach((r) => {
      counts[r.status] = parseInt(r.count, 10);
    });
    const totalTracked = counts.completed + counts.skipped + counts.partial;
    const executionPercentage = totalTracked > 0 ? Math.round((counts.completed / totalTracked) * 100) : null;

    const milestonesRes = await query(
      `SELECT * FROM milestones WHERE goal_id = $1 AND status = 'upcoming' ORDER BY target_date ASC NULLS LAST LIMIT 1`,
      [goal.id]
    );

    const latestReview = await query(
      'SELECT ai_recommendation FROM reviews WHERE goal_id = $1 ORDER BY created_at DESC LIMIT 1',
      [goal.id]
    );

    res.json({
      goal,
      today_actions: todaysActions,
      execution_percentage: executionPercentage,
      upcoming_milestone: milestonesRes.rows[0] || null,
      system_health: executionPercentage === null ? 'not enough data' : executionPercentage >= 70 ? 'healthy' : 'at risk',
      ai_recommendation: latestReview.rows[0]?.ai_recommendation || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load dashboard.' });
  }
});

// POST /api/actions/:id/complete
router.post('/actions/:id/complete', async (req, res) => {
  try {
    const { duration_minutes, difficulty, notes, mode } = req.body;
    const owned = await query(
      `SELECT ai.* FROM action_instances ai
       JOIN actions a ON a.id = ai.action_id
       JOIN systems s ON s.id = a.system_id
       JOIN goals g ON g.id = s.goal_id
       WHERE ai.id = $1 AND g.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Action instance not found.' });

    const updated = await query(
      `UPDATE action_instances
       SET status = 'completed', completed_at = now(), duration_minutes = $2, difficulty = $3, notes = $4,
           mode = COALESCE($5, mode)
       WHERE id = $1 RETURNING *`,
      [req.params.id, duration_minutes || null, difficulty || null, notes || null, mode || null]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not update action.' });
  }
});

// POST /api/actions/:id/skip
router.post('/actions/:id/skip', async (req, res) => {
  try {
    const { obstacle, notes } = req.body;
    const owned = await query(
      `SELECT ai.* FROM action_instances ai
       JOIN actions a ON a.id = ai.action_id
       JOIN systems s ON s.id = a.system_id
       JOIN goals g ON g.id = s.goal_id
       WHERE ai.id = $1 AND g.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Action instance not found.' });

    const updated = await query(
      `UPDATE action_instances SET status = 'skipped', obstacle = $2, notes = $3 WHERE id = $1 RETURNING *`,
      [req.params.id, obstacle || null, notes || null]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not update action.' });
  }
});

// POST /api/reviews/weekly { goal_id, period_start, period_end }
router.post('/reviews/weekly', async (req, res) => {
  try {
    const { goal_id, period_start, period_end } = req.body;
    if (!goal_id) return res.status(400).json({ error: 'goal_id is required.' });
    const goal = await assertGoalOwnership(goal_id, req.user.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found.' });

    const end = period_end || todayIso();
    const start = period_start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const result = await orchestrator.runWeeklyReview({ goalId: goal_id, periodStart: start, periodEnd: end });
    res.json(result);
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

// POST /api/adaptation { goal_id } - alias that runs a review + returns the adaptation directly
router.post('/adaptation', async (req, res) => {
  try {
    const { goal_id } = req.body;
    if (!goal_id) return res.status(400).json({ error: 'goal_id is required.' });
    const goal = await assertGoalOwnership(goal_id, req.user.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found.' });

    const end = todayIso();
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = await orchestrator.runWeeklyReview({ goalId: goal_id, periodStart: start, periodEnd: end });
    res.json(result.adaptation);
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
