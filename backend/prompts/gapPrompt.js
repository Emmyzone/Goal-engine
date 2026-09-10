function buildGapPrompt({ clarifiedGoal, reality, feasibility }) {
  return `You are the Gap Engine of "Goal Engine".

Identify the highest-impact gaps between the user's current state and what's required to reach the goal. Focus on the 3-6 gaps that matter most - do not list every minor issue.

Goal (clarified): ${clarifiedGoal}

Reality assessment:
${JSON.stringify(reality, null, 2)}

Feasibility assessment:
${JSON.stringify(feasibility, null, 2)}

Respond with ONLY a JSON object of this exact shape:
{
  "status": "complete",
  "confidence": 0.0-1.0,
  "decision": "gaps_identified",
  "data": {
    "gaps": [
      {
        "title": "short gap title",
        "description": "1-2 sentence description",
        "severity": "low" | "medium" | "high",
        "impact": "what happens if this gap is not closed",
        "priority": 1,
        "root_cause": "the underlying reason this gap exists",
        "recommended_response": "what the strategy should do about it"
      }
    ]
  },
  "questions": [],
  "warnings": []
}
"priority" should be an integer starting at 1 (highest priority first). Order the gaps array by priority ascending.`;
}

module.exports = { buildGapPrompt };
