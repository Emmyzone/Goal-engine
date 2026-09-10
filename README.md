# Goal Engine

Turn your goals into systems. Built by Emmyzone.

Goal Engine is not a chatbot. It's a structured AI decision system that takes a
goal, interviews the user, assesses their actual current reality, judges
feasibility honestly (including telling people when a goal is unrealistic),
finds the gaps, builds a strategy, and converts that strategy into a concrete
daily/weekly system with a minimum mode for hard days and a recovery mode for
missed days.

Flow: **Goal → AI Interview → Reality Assessment → Feasibility → Gap Analysis
→ Strategy → System → Daily Execution → Weekly Review → Adaptation.**

## Project structure

```
goal-engine/
├── frontend/              static HTML/CSS/JS (no build step)
│   ├── index.html         landing page
│   ├── login.html         login / signup
│   ├── app.html            goal input → interview → assessment → strategy/system
│   ├── dashboard.html     daily execution dashboard
│   ├── css/style.css
│   └── js/
│       ├── api.js         fetch wrapper + auth token handling
│       ├── interview.js   adaptive interview UI
│       ├── app.js         orchestrates the app.html flow (also covers what
│       │                  the spec called system.js — system rendering lives
│       │                  here since it shares state with the strategy step)
│       └── dashboard.js   dashboard UI
├── backend/
│   ├── server.js
│   ├── routes/            goals, interview, assessment, strategy, system, execution, auth
│   ├── engines/           orchestrator + the 7 specialized AI engines
│   ├── prompts/           one prompt builder per engine
│   ├── services/          openai.js (structured JSON completions + retry),
│   │                      database.js (pg pool), initDb.js (schema loader)
│   └── middleware/auth.js JWT auth
├── database/schema.sql
├── .env.example
├── package.json
└── render.yaml
```

## 1. Install dependencies

```bash
cd goal-engine
npm install
```

## 2. Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env`:

| Variable | Description |
|---|---|
| `PORT` | Local port (default 3000) |
| `JWT_SECRET` | Any long random string, used to sign login tokens |
| `DATABASE_URL` | Postgres connection string |
| `DATABASE_SSL` | `true` for hosted Postgres (Render), `false` for local |
| `OPENAI_API_KEY` | Your OpenAI API key — **never** committed or sent to the frontend |
| `OPENAI_MODEL` | Defaults to `gpt-4o-mini`; any JSON-mode-capable chat model works |

## 3. Connect PostgreSQL

Local Postgres example:

```bash
createdb goal_engine
# DATABASE_URL=postgresql://localhost:5432/goal_engine in .env
npm run db:init
```

`npm run db:init` runs `database/schema.sql` against `DATABASE_URL` and
creates every table (users, goals, reality_assessments,
feasibility_assessments, gaps, strategies, systems, actions,
action_instances, metrics, metric_records, milestones, reviews, adaptations,
conversations, messages, engine_runs, subscriptions).

## 4. Add the OpenAI API key

Paste your key into `OPENAI_API_KEY` in `.env`. It is only ever read on the
server (`backend/services/openai.js`) and is never sent to the browser.

## 5. Run locally

```bash
npm run dev     # nodemon, auto-restart
# or
npm start
```

Visit `http://localhost:3000`. Sign up, then click **Build My System**.

## 6. Deploy to Render

1. Push this folder to a GitHub repo.
2. In Render: **New → Blueprint**, point it at the repo. `render.yaml`
   provisions a free Postgres database and a free web service, and wires
   `DATABASE_URL` automatically.
3. Render will prompt you for `OPENAI_API_KEY` (marked `sync: false` in
   `render.yaml` so it's never stored in the repo) — paste your key there.
4. After the first deploy, open a shell on the web service (or run locally
   against the Render `DATABASE_URL`) and run `npm run db:init` once to
   create the schema.
5. Visit the deployed URL.

If you'd rather not use the Blueprint, create the Postgres instance and Web
Service manually in the Render dashboard, set the same environment variables
from `.env.example`, build command `npm install`, start command `npm start`.

## 7. Test the application

Manual test cases to run through the goal input screen:

| # | Input | Expected feasibility |
|---|---|---|
| 1 | "I want to learn basic HTML/CSS in 30 days." | REALISTIC or CHALLENGING |
| 2 | "I want to reach 5,000 followers in 90 days" (starting ~1,200) | CHALLENGING |
| 3 | "I want to make $1 billion in 7 days starting with $100." | UNREALISTIC |
| 4 | "I want to become successful." | Interview keeps asking questions until specific enough; if still too vague, classification comes back INSUFFICIENT_INFORMATION |
| 5 | Any goal, but answer the "how much time do you have" question with a very small amount | The generated daily actions should be short, and minimum mode even shorter |

You can also hit the API directly once logged in (grab the JWT from
`sessionStorage.goal_engine_token` in devtools):

```bash
curl -X POST http://localhost:3000/api/goals \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"raw_input":"I want to make $1 billion in 7 days starting with $100."}'
```

`GET /api/health` returns `{"status":"ok"}` and doesn't require auth — useful
for confirming the server and env vars are wired correctly before testing the
AI flow.

## Architecture notes

- **No giant prompt.** Each stage (`goalEngine`, `realityEngine`,
  `feasibilityEngine`, `gapEngine`, `strategyEngine`, `systemBuilder`,
  `feedbackEngine`) has its own prompt file in `backend/prompts/` and its own
  module in `backend/engines/`. `orchestrator.js` is the only thing that
  calls more than one engine, and it's the only thing routes talk to.
- **Structured output only.** `services/openai.js` forces
  `response_format: json_object`, parses it, and retries once with a
  stricter reminder if parsing fails. If it still fails, the route layer
  returns the exact user-facing message from the spec ("Goal Engine is
  temporarily unable to complete this analysis...") and logs the failure to
  `engine_runs` — API keys and stack traces are never exposed to the client.
- **Ownership checks.** Every route that touches a `goal_id` verifies the
  goal belongs to `req.user.id` before doing anything, so users can only ever
  see their own data.
- **Extending later.** Payments (`subscriptions` table already exists),
  more goal categories, calendar/email integrations, and AI memory can all be
  added without touching the orchestrator's control flow — they're additive
  by design (see section 36 of the original spec for the full list this was
  built to accommodate).
