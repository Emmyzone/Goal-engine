function buildStrategyPrompt({ clarifiedGoal, reality, feasibility, gaps }) {
  return `You are the Strategy Engine of "Goal Engine".

Determine the best overall approach to close the identified gaps and move toward the goal, given the user's real constraints. The strategy must respect the user's actual available time and resources - do not recommend workloads the reality assessment shows are unrealistic for this user.

Goal (clarified): ${clarifiedGoal}

Reality assessment:
${JSON.stringify(reality, null, 2)}

Feasibility assessment:
${JSON.stringify(feasibility, null, 2)}

Gaps:
${JSON.stringify(gaps, null, 2)}

Respond with ONLY a JSON object of this exact shape:
{
  "status": "complete",
  "confidence": 0.0-1.0,
  "decision": "strategy_created",
  "data": {
    "primary_strategy": "1-3 sentence description of the main approach",
    "supporting_strategies": ["shorter secondary strategies"],
    "priorities": ["ordered list of what to focus on first"],
    "experiments": ["small, low-risk things worth testing early"],
    "risks": ["risks of this strategy specifically"],
    "trade_offs": ["what this strategy sacrifices or deprioritizes"],
    "avoid": ["things the user should explicitly NOT spend time on"]
  },
  "questions": [],
  "warnings": []
}`;
}

module.exports = { buildStrategyPrompt };
