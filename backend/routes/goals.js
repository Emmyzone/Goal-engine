const express = require('express');
const { query } = require('../services/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// POST /api/goals - create a new goal from raw text input
router.post('/', async (req, res) => {
  try {
    const { raw_input, category } = req.body;
    if (!raw_input || !raw_input.trim()) {
      return res.status(400).json({ error: 'raw_input is required.' });
    }

    const inserted = await query(
      `INSERT INTO goals (user_id, raw_input, category, status) VALUES ($1,$2,$3,'interviewing') RETURNING *`,
      [req.user.id, raw_input.trim(), category || 'other']
    );
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not create goal.' });
  }
});

// GET /api/goals - list current user's goals
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at DESC', [
      req.user.id,
    ]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not load goals.' });
  }
});

// GET /api/goals/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM goals WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Goal not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not load goal.' });
  }
});

module.exports = router;
