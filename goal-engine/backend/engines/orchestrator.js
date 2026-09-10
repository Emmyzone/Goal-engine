const { query } = require('../services/database');
const goalEngine = require('./goalEngine');
const realityEngine = require('./realityEngine');
const feasibilityEngine = require('./feasibilityEngine');
const gapEngine = require('./gapEngine');
const strategyEngine = require('./strategyEngine');
const systemBuilder = require('./systemBuilder');
const feedbackEngine = require('./feedbackEngine');

/**
 * The Orchestrator is the single place that knows the overall workflow:
 *
 * GOAL -> INTERVIEW -> REALITY -> FEASIBILITY -> GAPS -> STRATEGY -> SYSTEM -> EXECUTION -> REVIEW -> ADAPTATION
 *
 * Routes call the orchestrator; the orchestrator calls engines and persists results.
 * No engine calls another engine directly, and no route talks to an engine directly.
 */

// ---------------------------------------------------------------------------
// INTERVIEW STEP
// ---------------------------------------------------------------------------
async function advanceInterview({ goalId }) {
  const goalRes = await query('SELECT * FROM goals WHERE id = $1', [goalId]);
  const goal = goalRes.rows[0];
  if (!goal) throw new Error('Goal not found');

  let convRes = await query(
    "SELECT * FROM conversations WHERE goal_id = $1 AND purpose = 'interview' LIMIT 1",
    [goalId]
  );
  let conversation = convRes.rows[0];
  if (!conversation) {
    const inserted = await query(
      "INSERT INTO conversations (goal_id, purpose) VALUES ($1, 'interview') RETURNING *",
      [goalId]
    );
    conversation = inserted.rows[0];
  }

  const msgRes = await query(
    'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversation.id]
  );
  const priorMessages = msgRes.rows;

  const result = await goalEngine.nextInterviewStep({
    goalId,
    rawGoal: goal.raw_input,
    category: goal.category,
    priorMessages,
  });

  if (result.decision === 'ask_question' && result.questions && result.questions.length > 0) {
    const question = result.questions[0];
    await query(
      "INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'ai', $2)",
      [conversation.id, question]
    );
    return { done: false, question, data: result.data };
  }

  // Interview complete: persist the clarified goal onto the goal row.
  await query(
    `UPDATE goals SET structured_goal = $1, category = $2, status = 'assessing', updated_at = now() WHERE id = $3`,
    [result.data, result.data?.category || goal.category, goalId]
  );

  return { done: true, data: result.data };
}

async function recordInterviewAnswer({ goalId, answer }) {
  const convRes = await query(
    "SELECT * FROM conversations WHERE goal_id = $1 AND purpose = 'interview' LIMIT 1",
    [goalId]
  );
  const conversation = convRes.rows[0];
  if (!conversation) throw new Error('Interview has not started for this goal.');

  await query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)", [
    conversation.id,
    answer,
  ]);
}

// ---------------------------------------------------------------------------
// REALITY -> FEASIBILITY -> GAPS (each independently callable, matching the
// three /api/assessment/* routes; each reads whatever prior stage output it
// needs from the database rather than requiring the caller to chain them)
// ---------------------------------------------------------------------------
async function getGoalOrThrow(goalId) {
  const goalRes = await query('SELECT * FROM goals WHERE id = $1', [goalId]);
  const goal = goalRes.rows[0];
  if (!goal) throw new Error('Goal not found');
  return goal;
}

async function runRealityAssessment({ goalId }) {
  const goal = await getGoalOrThrow(goalId);

  const convRes = await query(
    "SELECT * FROM conversations WHERE goal_id = $1 AND purpose = 'interview' LIMIT 1",
    [goalId]
  );
  const conversation = convRes.rows[0];
  const msgRes = conversation
    ? await query('SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [
        conversation.id,
      ])
    : { rows: [] };

  const interviewTranscript = msgRes.rows
    .map((m) => `${m.role === 'ai' ? 'Q' : 'A'}: ${m.content}`)
    .join('\n');

  const clarifiedGoal = goal.structured_goal?.clarified_goal || goal.raw_input;

  const reality = await realityEngine.assessReality({
    goalId,
    clarifiedGoal,
    category: goal.category,
    interviewTranscript,
  });
  const realityRow = await query(
    `INSERT INTO reality_assessments
      (goal_id, current_position, skills, resources, available_time, constraints, strengths, weaknesses, previous_attempts, observations, raw_output)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      goalId,
      reality.data.current_position,
      JSON.stringify(reality.data.skills || []),
      JSON.stringify(reality.data.resources || []),
      JSON.stringify(reality.data.available_time || null),
      JSON.stringify(reality.data.constraints || []),
      JSON.stringify(reality.data.strengths || []),
      JSON.stringify(reality.data.weaknesses || []),
      JSON.stringify(reality.data.previous_attempts || []),
      JSON.stringify(reality.data.observations || []),
      reality,
    ]
  );

  return realityRow.rows[0];
}

async function runFeasibilityAssessment({ goalId }) {
  const goal = await getGoalOrThrow(goalId);
  const clarifiedGoal = goal.structured_goal?.clarified_goal || goal.raw_input;

  const realityRes = await query(
    'SELECT * FROM reality_assessments WHERE goal_id = $1 ORDER BY created_at DESC LIMIT 1',
    [goalId]
  );
  const reality = realityRes.rows[0];
  if (!reality) throw new Error('Run the reality assessment before feasibility.');

  const feasibility = await feasibilityEngine.assessFeasibility({
    goalId,
    clarifiedGoal,
    deadlineDays: goal.structured_goal?.deadline_days || null,
    reality,
  });
  const feasibilityRow = await query(
    `INSERT INTO feasibility_assessments
      (goal_id, classification, explanation, key_assumptions, risks, conditions_required, confidence, raw_output)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      goalId,
      feasibility.data.classification,
      feasibility.data.explanation,
      JSON.stringify(feasibility.data.key_assumptions || []),
      JSON.stringify(feasibility.data.risks || []),
      JSON.stringify(feasibility.data.conditions_required || []),
      feasibility.confidence || null,
      feasibility,
    ]
  );

  await query("UPDATE goals SET status = 'strategized', updated_at = now() WHERE id = $1", [goalId]);

  return feasibilityRow.rows[0];
}

async function runGapAnalysis({ goalId }) {
  const goal = await getGoalOrThrow(goalId);
  const clarifiedGoal = goal.structured_goal?.clarified_goal || goal.raw_input;

  const realityRes = await query(
    'SELECT * FROM reality_assessments WHERE goal_id = $1 ORDER BY created_at DESC LIMIT 1',
    [goalId]
  );
  const feasibilityRes = await query(
    'SELECT * FROM feasibility_assessments WHERE goal_id = $1 ORDER BY created_at DESC LIMIT 1',
    [goalId]
  );
  const reality = realityRes.rows[0];
  const feasibility = feasibilityRes.rows[0];
  if (!reality || !feasibility) {
    throw new Error('Run the reality and feasibility assessments before gap analysis.');
  }

  const gaps = await gapEngine.analyzeGaps({ goalId, clarifiedGoal, reality, feasibility });
  const gapRows = [];
  for (const g of gaps.data.gaps || []) {
    const inserted = await query(
      `INSERT INTO gaps (goal_id, title, description, severity, impact, priority, root_cause, recommended_response)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [goalId, g.title, g.description, g.severity, g.impact, g.priority, g.root_cause, g.recommended_response]
    );
    gapRows.push(inserted.rows[0]);
  }
  return gapRows;
}

// ---------------------------------------------------------------------------
// STRATEGY -> SYSTEM
// ---------------------------------------------------------------------------
async function runStrategyAndSystem({ goalId }) {
  const goalRes = await query('SELECT * FROM goals WHERE id = $1', [goalId]);
  const goal = goalRes.rows[0];
  if (!goal) throw new Error('Goal not found');
  const clarifiedGoal = goal.structured_goal?.clarified_goal || goal.raw_input;

  const realityRes = await query(
    'SELECT * FROM reality_assessments WHERE goal_id = $1 ORDER BY created_at DESC LIMIT 1',
    [goalId]
  );
  const feasibilityRes = await query(
    'SELECT * FROM feasibility_assessments WHERE goal_id = $1 ORDER BY created_at DESC LIMIT 1',
    [goalId]
  );
  const gapsRes = await query('SELECT * FROM gaps WHERE goal_id = $1 ORDER BY priority ASC', [goalId]);

  const reality = realityRes.rows[0];
  const feasibility = feasibilityRes.rows[0];
  const gaps = gapsRes.rows;

  if (!reality || !feasibility) {
    throw new Error('Assessment must be completed before generating a strategy.');
  }

  // Strategy
  const strategy = await strategyEngine.buildStrategy({
    goalId,
    clarifiedGoal,
    reality,
    feasibility,
    gaps,
  });
  const strategyRow = await query(
    `INSERT INTO strategies
      (goal_id, primary_strategy, supporting_strategies, priorities, experiments, risks, trade_offs, avoid, raw_output)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      goalId,
      strategy.data.primary_strategy,
      JSON.stringify(strategy.data.supporting_strategies || []),
      JSON.stringify(strategy.data.priorities || []),
      JSON.stringify(strategy.data.experiments || []),
      JSON.stringify(strategy.data.risks || []),
      JSON.stringify(strategy.data.trade_offs || []),
      JSON.stringify(strategy.data.avoid || []),
      strategy,
    ]
  );

  // System
  const system = await systemBuilder.buildSystem({
    goalId,
    clarifiedGoal,
    reality,
    strategy: strategy.data,
  });
  const systemRow = await query(
    `INSERT INTO systems (goal_id, strategy_id, rules, review_schedule, raw_output)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [
      goalId,
      strategyRow.rows[0].id,
      JSON.stringify(system.data.rules || []),
      system.data.review_schedule || null,
      system,
    ]
  );
  const systemId = systemRow.rows[0].id;

  const actionRows = [];
  for (const a of system.data.daily_actions || []) {
    const inserted = await query(
      `INSERT INTO actions (system_id, title, cadence, normal_instruction, minimum_instruction, target_time)
       VALUES ($1,$2,'daily',$3,$4,$5) RETURNING *`,
      [systemId, a.title, a.normal_instruction, a.minimum_instruction, a.target_time || null]
    );
    actionRows.push(inserted.rows[0]);
  }
  for (const a of system.data.weekly_actions || []) {
    const inserted = await query(
      `INSERT INTO actions (system_id, title, cadence, normal_instruction, minimum_instruction)
       VALUES ($1,$2,'weekly',$3,$4) RETURNING *`,
      [systemId, a.title, a.normal_instruction, a.minimum_instruction]
    );
    actionRows.push(inserted.rows[0]);
  }

  for (const m of system.data.monthly_milestones || []) {
    await query(
      `INSERT INTO milestones (goal_id, title, status) VALUES ($1,$2,'upcoming')`,
      [goalId, m.title]
    );
  }

  await query("UPDATE goals SET status = 'active', updated_at = now() WHERE id = $1", [goalId]);

  return { strategy: strategyRow.rows[0], system: systemRow.rows[0], actions: actionRows };
}

// ---------------------------------------------------------------------------
// FEEDBACK / ADAPTATION
// ---------------------------------------------------------------------------
async function runWeeklyReview({ goalId, periodStart, periodEnd }) {
  const goalRes = await query('SELECT * FROM goals WHERE id = $1', [goalId]);
  const goal = goalRes.rows[0];
  if (!goal) throw new Error('Goal not found');
  const clarifiedGoal = goal.structured_goal?.clarified_goal || goal.raw_input;

  const instancesRes = await query(
    `SELECT ai.* FROM action_instances ai
     JOIN actions a ON a.id = ai.action_id
     JOIN systems s ON s.id = a.system_id
     WHERE s.goal_id = $1 AND ai.scheduled_date BETWEEN $2 AND $3`,
    [goalId, periodStart, periodEnd]
  );
  const instances = instancesRes.rows;
  const planned = instances.length;
  const completed = instances.filter((i) => i.status === 'completed').length;
  const missed = instances.filter((i) => i.status === 'skipped').length;
  const executionRate = planned > 0 ? Math.round((completed / planned) * 10000) / 100 : 0;

  const metricsRes = await query(
    `SELECT m.name, m.type, mr.value, mr.recorded_at
     FROM metric_records mr
     JOIN metrics m ON m.id = mr.metric_id
     WHERE m.goal_id = $1 AND mr.recorded_at BETWEEN $2 AND $3
     ORDER BY mr.recorded_at ASC`,
    [goalId, periodStart, periodEnd]
  );

  const systemRes = await query(
    'SELECT * FROM systems WHERE goal_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
    [goalId]
  );
  const system = systemRes.rows[0];

  const feedback = await feedbackEngine.diagnoseAndAdapt({
    goalId,
    clarifiedGoal,
    executionSummary: { planned, completed, missed, executionRate },
    progressSummary: metricsRes.rows,
    system,
  });

  const reviewRow = await query(
    `INSERT INTO reviews
      (goal_id, period_start, period_end, planned_count, completed_count, missed_count, execution_rate,
       what_worked, what_didnt, ai_diagnosis, ai_recommendation, raw_output)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      goalId,
      periodStart,
      periodEnd,
      planned,
      completed,
      missed,
      executionRate,
      feedback.data.what_worked,
      feedback.data.what_didnt,
      feedback.data.diagnosis,
      feedback.data.recommendation,
      feedback,
    ]
  );

  const adaptationRow = await query(
    `INSERT INTO adaptations (goal_id, review_id, diagnosis_area, recommended_change, raw_output)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [goalId, reviewRow.rows[0].id, feedback.decision, feedback.data.recommendation, feedback]
  );

  return { review: reviewRow.rows[0], adaptation: adaptationRow.rows[0] };
}

module.exports = {
  advanceInterview,
  recordInterviewAnswer,
  runRealityAssessment,
  runFeasibilityAssessment,
  runGapAnalysis,
  runStrategyAndSystem,
  runWeeklyReview,
};
