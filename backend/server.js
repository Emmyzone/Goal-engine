require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { pool } = require('./services/database');

const authRoutes = require('./routes/auth');
const goalRoutes = require('./routes/goals');
const interviewRoutes = require('./routes/interview');
const assessmentRoutes = require('./routes/assessment');
const strategyRoutes = require('./routes/strategy');
const systemRoutes = require('./routes/system');
const executionRoutes = require('./routes/execution');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api/strategy', strategyRoutes);
app.use('/api/system', systemRoutes);
app.use('/api', executionRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'goal-engine', builtBy: 'Emmyzone' });
});

const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: 'Goal Engine encountered an unexpected error. Your information has been saved. Please try again.',
  });
});

app.listen(PORT, () => {
  console.log(`Goal Engine server listening on port ${PORT}`);

  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  pool
    .query(sql)
    .then(() => console.log('Database schema verified/created.'))
    .catch((err) => {
      console.error('Schema setup failed (server will keep running):', err.message);
    });
});
