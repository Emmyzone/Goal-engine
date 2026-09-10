function esc(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function getGoalIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('goal');
}

async function loadDashboard(goalId) {
  const loading = document.getElementById('dash-loading');
  const content = document.getElementById('dash-content');
  const errorEl = document.getElementById('dash-error');
  loading.style.display = 'block';
  content.style.display = 'none';
  errorEl.innerHTML = '';

  try {
    const data = await GoalEngineAPI.get(`/api/dashboard/${goalId}`);
    render(goalId, data);
    loading.style.display = 'none';
    content.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    errorEl.innerHTML = `<div class="error-banner">${esc(err.message)}</div>`;
  }
}

function render(goalId, data) {
  const clarified = data.goal?.structured_goal?.clarified_goal || data.goal?.raw_input;
  document.getElementById('goal-title').textContent = clarified;

  document.getElementById('stat-execution').textContent =
    data.execution_percentage === null ? '—' : `${data.execution_percentage}%`;
  document.getElementById('stat-health').textContent = data.system_health || '—';
  document.getElementById('stat-milestone').textContent = data.upcoming_milestone
    ? data.upcoming_milestone.title
    : 'none set';

  if (data.ai_recommendation) {
    document.getElementById('ai-recommendation').textContent = data.ai_recommendation;
  }

  const list = document.getElementById('today-actions');
  const actions = data.today_actions || [];
  if (actions.length === 0) {
    list.innerHTML = '<p>No daily actions yet — build your system from the goal flow first.</p>';
    return;
  }

  list.innerHTML = actions
    .map((a) => {
      const completed = a.status === 'completed';
      return `
      <div class="action-item ${completed ? 'completed' : ''}" data-instance="${a.instance_id}">
        <div>
          <div class="title">${esc(a.title)}</div>
          <div class="instruction">${esc(a.normal_instruction)}</div>
        </div>
        <div class="action-buttons">
          ${
            completed
              ? '<span style="font-size:0.82rem; color: var(--good);">done</span>'
              : `<button class="complete" data-action="complete" data-instance="${a.instance_id}">Complete</button>
                 <button class="skip" data-action="skip" data-instance="${a.instance_id}">Skip</button>`
          }
        </div>
      </div>`;
    })
    .join('');

  list.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleActionClick(goalId, btn.dataset.instance, btn.dataset.action));
  });
}

async function handleActionClick(goalId, instanceId, action) {
  try {
    if (action === 'complete') {
      await GoalEngineAPI.post(`/api/actions/${instanceId}/complete`, {});
    } else {
      await GoalEngineAPI.post(`/api/actions/${instanceId}/skip`, {});
    }
    loadDashboard(goalId);
  } catch (err) {
    document.getElementById('dash-error').innerHTML = `<div class="error-banner">${esc(err.message)}</div>`;
  }
}

async function runReview(goalId) {
  const btn = document.getElementById('run-review-btn');
  btn.disabled = true;
  btn.textContent = 'Running review…';
  try {
    const result = await GoalEngineAPI.post('/api/reviews/weekly', { goal_id: goalId });
    document.getElementById('ai-recommendation').textContent = result.review.ai_recommendation;
  } catch (err) {
    document.getElementById('dash-error').innerHTML = `<div class="error-banner">${esc(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Weekly Review';
  }
}

function init() {
  GoalEngineAPI.requireAuthOrRedirect();
  const goalId = getGoalIdFromUrl();
  if (!goalId) {
    document.getElementById('dash-loading').style.display = 'none';
    document.getElementById('dash-error').innerHTML =
      '<div class="error-banner">No goal selected. Start from the goal flow.</div>';
    return;
  }
  loadDashboard(goalId);
  document.getElementById('run-review-btn').addEventListener('click', () => runReview(goalId));
  document.getElementById('logout-link').addEventListener('click', (e) => {
    e.preventDefault();
    GoalEngineAPI.clearToken();
    window.location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', init);
