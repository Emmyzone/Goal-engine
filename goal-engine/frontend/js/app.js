/**
 * Orchestrates the app.html flow: goal input -> interview -> assessment -> strategy/system.
 * Interview-specific rendering lives in interview.js; this file owns the rest.
 */
const App = {
  goalId: null,
};

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function renderList(items) {
  if (!items || items.length === 0) return '<li style="color: var(--text-faint);">none noted</li>';
  return items.map((i) => `<li>${esc(i)}</li>`).join('');
}

async function createGoalAndStartInterview() {
  const text = document.getElementById('goal-input').value.trim();
  const errorEl = document.getElementById('goal-error');
  errorEl.innerHTML = '';

  if (!text) {
    errorEl.innerHTML = '<div class="error-banner">Enter a goal to continue.</div>';
    return;
  }

  document.getElementById('goal-continue').disabled = true;
  try {
    const goal = await GoalEngineAPI.post('/api/goals', { raw_input: text });
    App.goalId = goal.id;
    Interview.start(goal.id);
  } catch (err) {
    errorEl.innerHTML = `<div class="error-banner">${esc(err.message)}</div>`;
  } finally {
    document.getElementById('goal-continue').disabled = false;
  }
}

App.runAssessment = async function runAssessment() {
  document.getElementById('step-interview').style.display = 'none';
  document.getElementById('step-assessment').style.display = 'block';
  const loading = document.getElementById('assessment-loading');
  const content = document.getElementById('assessment-content');
  const errorEl = document.getElementById('assessment-error');
  loading.style.display = 'block';
  content.style.display = 'none';
  errorEl.innerHTML = '';

  try {
    const reality = await GoalEngineAPI.post('/api/assessment/reality', { goal_id: App.goalId });
    const feasibility = await GoalEngineAPI.post('/api/assessment/feasibility', { goal_id: App.goalId });
    const gaps = await GoalEngineAPI.post('/api/assessment/gaps', { goal_id: App.goalId });

    renderAssessment(reality, feasibility, gaps);
    loading.style.display = 'none';
    content.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    errorEl.innerHTML = `<div class="error-banner">${esc(err.message)}</div>`;
  }
};

function renderAssessment(reality, feasibility, gaps) {
  const badge = document.getElementById('feasibility-badge');
  badge.innerHTML = `
    <div class="classification ${feasibility.classification}">${feasibility.classification.replace(/_/g, ' ')}</div>
    <p>${esc(feasibility.explanation)}</p>
  `;

  const cards = document.getElementById('reality-cards');
  cards.innerHTML = `
    <div class="card"><h3>current position</h3><p class="single-value">${esc(reality.current_position)}</p></div>
    <div class="card"><h3>available time</h3><p class="single-value">${esc(reality.available_time || '')}</p></div>
    <div class="card"><h3>strengths</h3><ul>${renderList(reality.strengths)}</ul></div>
    <div class="card"><h3>weaknesses</h3><ul>${renderList(reality.weaknesses)}</ul></div>
    <div class="card"><h3>constraints</h3><ul>${renderList(reality.constraints)}</ul></div>
    <div class="card"><h3>previous attempts</h3><ul>${renderList(reality.previous_attempts)}</ul></div>
  `;

  const gapsList = document.getElementById('gaps-list');
  gapsList.innerHTML = gaps
    .map(
      (g) => `
    <div class="gap-row">
      <div class="gap-severity ${g.severity}">${esc(g.severity || '')}</div>
      <div>
        <h4>${esc(g.title)}</h4>
        <p>${esc(g.description)}</p>
        <div class="gap-meta">root cause: ${esc(g.root_cause)}</div>
      </div>
    </div>`
    )
    .join('');

  document.getElementById('strategy-btn').onclick = buildStrategyAndSystem;
}

async function buildStrategyAndSystem() {
  document.getElementById('step-assessment').style.display = 'none';
  document.getElementById('step-system').style.display = 'block';
  const loading = document.getElementById('system-loading');
  const content = document.getElementById('system-content');
  const errorEl = document.getElementById('system-error');
  loading.style.display = 'block';
  content.style.display = 'none';
  errorEl.innerHTML = '';

  try {
    const strategy = await GoalEngineAPI.post('/api/strategy', { goal_id: App.goalId });
    const systemResult = await GoalEngineAPI.post('/api/system', { goal_id: App.goalId });
    renderSystem(strategy, systemResult);
    loading.style.display = 'none';
    content.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    errorEl.innerHTML = `<div class="error-banner">${esc(err.message)}</div>`;
  }
}

function renderSystem(strategy, systemResult) {
  const cards = document.getElementById('strategy-cards');
  cards.innerHTML = `
    <div class="card" style="grid-column: 1 / -1;"><h3>primary strategy</h3><p class="single-value">${esc(strategy.primary_strategy)}</p></div>
    <div class="card"><h3>priorities</h3><ul>${renderList(strategy.priorities)}</ul></div>
    <div class="card"><h3>avoid</h3><ul>${renderList(strategy.avoid)}</ul></div>
  `;

  const actions = (systemResult.actions || []).filter((a) => a.cadence === 'daily');
  const list = document.getElementById('daily-actions-list');
  list.innerHTML = actions
    .map(
      (a) => `
    <div class="action-item">
      <div>
        <div class="title">${esc(a.title)}</div>
        <div class="instruction">${esc(a.normal_instruction)}</div>
      </div>
    </div>`
    )
    .join('');

  document.getElementById('dashboard-btn').onclick = () => {
    window.location.href = `dashboard.html?goal=${App.goalId}`;
  };
  document.getElementById('dash-link').style.display = 'inline';
}

function init() {
  GoalEngineAPI.requireAuthOrRedirect();
  Interview.init();
  document.getElementById('goal-continue').addEventListener('click', createGoalAndStartInterview);
  document.getElementById('logout-link').addEventListener('click', (e) => {
    e.preventDefault();
    GoalEngineAPI.clearToken();
    window.location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', init);
