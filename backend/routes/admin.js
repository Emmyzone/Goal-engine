const express = require('express');
const { query } = require('../services/database');

const router = express.Router();

function requireAdminKey(req, res, next) {
  const configuredKey = process.env.ADMIN_KEY;
  if (!configuredKey) {
    return res.status(503).json({ error: 'Admin access is not configured on this server.' });
  }
  const providedKey = req.headers['x-admin-key'];
  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({ error: 'Invalid admin key.' });
  }
  next();
}

router.use(requireAdminKey);

router.get('/users', async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.name, u.created_at,
              COUNT(g.id) AS goal_count
       FROM users u
       LEFT JOIN goals g ON g.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not load users.' });
  }
});

module.exports = router;
