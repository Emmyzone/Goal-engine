require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const goalRoutes = require('./routes/goals');
const interviewRoutes = require('./routes/interview');
const assessmentRoutes = require('./routes/assessment');
const strategyRoutes = require('./routes/strategy');l
const systemRoutes = require('./routes/system');
const executionRoutes = require('./routes/execution');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// --- API routes ---
app.use('/api/auth', authRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api/strategy', strategyRoutes);
app.use('/api/system', systemRoutes);
app.use('/api', executionRoutes); // dashboard, actions, reviews, adaptation

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'goal-engine', builtBy: 'Emmyzone' });
});
app.get('/api/admin/users', async (req, res) => {
  try {
    const { pool } = require('./services/database');
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    
    let html = `<h2>Registered Users (${result.rowCount})</h2>`;
    html += `<table border="1" cellpadding="10" style="border-collapse: collapse; width: 100%; font-family: sans-serif;">`;
    html += `<tr style="background: #f2f2f2;"><th>ID</th><th>Email</th><th>Signed Up At</th></tr>`;
    result.rows.forEach(row => {
      html += `<tr><td>${row.id}</td><td>${row.email}</td><td>${row.created_at}</td></tr>`;
    });
    html += `</table>`;
    
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

});

// --- Static frontend ---
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// --- Global error handler (never leak internals) ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: 'Goal Engine encountered an unexpected error. Your information has been saved. Please try again.',
  });
});

app.listen(PORT, () => {
  console.log(`Goal Engine server listening on port ${PORT}`);
});
