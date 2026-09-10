function buildFeedbackPrompt({ clarifiedGoal, executionSummary, progressSummary, system }) {
  return `You are the Feedback Engine of "Goal Engine".

Diagnose why progress is or isn't happening, using execution data (did the user do the actions) and progress data (did the metrics move). Recommend the SMALLEST useful change - do not recommend rebuilding the whole system unless the evidence clearly requires it.

Diagnosis categories (choose the single best fit):
- "execution" - the system wasn't followed. Investigate whether it's too difficult or poorly timed.
- "system_design" - followed reasonably well but the system itself is flawed.
- "strategy" - execution is high but results are poor; the underlying approach may be wrong.
- "resources" - the user lacks resources/tools/access needed to succeed.
- "external" - external circumstances outside the user's control are the primary factor.
- "goal_assumptions" - the original goal or its assumptions need revisiting.
- "on_track" - execution and results are both good; continue current system.

Goal (clarified): ${clarifiedGoal}

Execution summary (planned vs completed/skipped/partial over the period):
${JSON.stringify(executionSummary, null, 2)}

Progress summary (metric movement over the period):
${JSON.stringify(progressSummary, null, 2)}

Current system:
${JSON.stringify(system, null, 2)}

Respond with ONLY a JSON object of this exact shape:
{
  "status": "complete",
  "confidence": 0.0-1.0,
  "decision": "execution" | "system_design" | "strategy" | "resources" | "external" | "goal_assumptions" | "on_track",
  "data": {
    "execution_rate": "0-100 number",
    "what_worked": "1-2 sentences",
    "what_didnt": "1-2 sentences",
    "diagnosis": "1-3 sentence honest diagnosis referencing the category chosen",
    "recommendation": "the smallest useful change to make, described concretely",
    "system_changes": ["specific, minimal changes to apply to the system, empty array if none needed"]
  },
  "questions": [],
  "warnings": []
}`;
}

module.exports = { buildFeedbackPrompt };
