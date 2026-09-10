/**
 * Handles rendering and progressing the adaptive AI interview.
 * Depends on the global `App` state object defined in app.js.
 */
const Interview = (() => {
  let questionCount = 0;
  const MAX_EXPECTED_QUESTIONS = 6; // used only to drive the progress bar, not a hard limit

  const qaLog = () => document.getElementById('qa-log');
  const answerField = () => document.getElementById('answer-field');
  const answerInput = () => document.getElementById('answer-input');
  const answerContinueBtn = () => document.getElementById('answer-continue');
  const analyzeBtn = () => document.getElementById('analyze-btn');
  const loadingEl = () => document.getElementById('interview-loading');
  const errorEl = () => document.getElementById('interview-error');
  const progressEl = () => document.getElementById('interview-progress');

  function addEntry(role, text) {
    const div = document.createElement('div');
    div.className = `qa-item ${role}`;
    div.innerHTML = `<span class="who">${role === 'ai' ? 'Goal Engine' : 'You'}</span>${escapeHtml(text)}`;
    qaLog().appendChild(div);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function setLoading(isLoading) {
    loadingEl().style.display = isLoading ? 'block' : 'none';
    answerField().style.display = isLoading ? 'none' : answerField().dataset.shouldShow === '1' ? 'block' : 'none';
  }

  function showError(message) {
    errorEl().innerHTML = message ? `<div class="error-banner">${escapeHtml(message)}</div>` : '';
  }

  function updateProgress() {
    const pct = Math.min(95, 10 + (questionCount / MAX_EXPECTED_QUESTIONS) * 85);
    progressEl().style.width = `${pct}%`;
  }

  async function start(goalId) {
    document.getElementById('step-goal').style.display = 'none';
    document.getElementById('step-interview').style.display = 'block';
    setLoading(true);
    try {
      const step = await GoalEngineAPI.post('/api/interview/start', { goal_id: goalId });
      handleStep(step);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleStep(step) {
    showError('');
    if (step.done) {
      progressEl().style.width = '100%';
      answerField().style.display = 'none';
      answerField().dataset.shouldShow = '0';
      answerContinueBtn().style.display = 'none';
      analyzeBtn().style.display = 'inline-flex';
      addEntry('ai', "Your information is ready.");
      return;
    }

    questionCount += 1;
    updateProgress();
    addEntry('ai', step.question);
    answerField().style.display = 'block';
    answerField().dataset.shouldShow = '1';
    answerInput().value = '';
    answerInput().focus();
    answerContinueBtn().style.display = 'inline-flex';
    analyzeBtn().style.display = 'none';
  }

  async function submitAnswer() {
    const value = answerInput().value.trim();
    if (!value) return;
    addEntry('user', value);
    answerField().style.display = 'none';
    answerContinueBtn().style.display = 'none';
    setLoading(true);
    try {
      const step = await GoalEngineAPI.post('/api/interview/message', {
        goal_id: App.goalId,
        answer: value,
      });
      handleStep(step);
    } catch (err) {
      showError(err.message);
      answerField().style.display = 'block';
      answerContinueBtn().style.display = 'inline-flex';
    } finally {
      setLoading(false);
    }
  }

  function init() {
    document.getElementById('answer-continue').addEventListener('click', submitAnswer);
    document.getElementById('analyze-btn').addEventListener('click', () => App.runAssessment());
    document.getElementById('answer-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAnswer();
    });
  }

  return { start, init };
})();
