-- Goal Engine Database Schema
-- PostgreSQL

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================
-- USERS
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- GOALS
-- =========================================================
CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    raw_input TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'other',
    structured_goal JSONB,             -- clarified goal object from goalEngine
    status VARCHAR(30) NOT NULL DEFAULT 'interviewing',
    -- interviewing | assessing | strategized | system_built | active | paused | completed | abandoned
    deadline DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);

-- =========================================================
-- CONVERSATIONS / MESSAGES (AI Interview)
-- =========================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    purpose VARCHAR(50) NOT NULL DEFAULT 'interview', -- interview | review | adaptation
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversations_goal_id ON conversations(goal_id);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- ai | user
    content TEXT NOT NULL,
    meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- =========================================================
-- REALITY ASSESSMENTS
-- =========================================================
CREATE TABLE IF NOT EXISTS reality_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    current_position TEXT,
    skills JSONB,
    resources JSONB,
    available_time JSONB,
    constraints JSONB,
    strengths JSONB,
    weaknesses JSONB,
    previous_attempts JSONB,
    observations JSONB,
    raw_output JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reality_goal_id ON reality_assessments(goal_id);

-- =========================================================
-- FEASIBILITY ASSESSMENTS
-- =========================================================
CREATE TABLE IF NOT EXISTS feasibility_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    classification VARCHAR(30) NOT NULL,
    -- REALISTIC | CHALLENGING | HIGHLY_UNCERTAIN | UNREALISTIC | INSUFFICIENT_INFORMATION
    explanation TEXT,
    key_assumptions JSONB,
    risks JSONB,
    conditions_required JSONB,
    confidence NUMERIC(4,3),
    raw_output JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feasibility_goal_id ON feasibility_assessments(goal_id);

-- =========================================================
-- GAPS
-- =========================================================
CREATE TABLE IF NOT EXISTS gaps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(20),      -- low | medium | high
    impact TEXT,
    priority INTEGER,
    root_cause TEXT,
    recommended_response TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gaps_goal_id ON gaps(goal_id);

-- =========================================================
-- STRATEGIES
-- =========================================================
CREATE TABLE IF NOT EXISTS strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    primary_strategy TEXT,
    supporting_strategies JSONB,
    priorities JSONB,
    experiments JSONB,
    risks JSONB,
    trade_offs JSONB,
    avoid JSONB,
    raw_output JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_strategies_goal_id ON strategies(goal_id);

-- =========================================================
-- SYSTEMS
-- =========================================================
CREATE TABLE IF NOT EXISTS systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
    version INTEGER NOT NULL DEFAULT 1,
    rules JSONB,
    review_schedule VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    raw_output JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_systems_goal_id ON systems(goal_id);

-- =========================================================
-- ACTIONS (templates: daily/weekly/monthly + minimum/recovery variants)
-- =========================================================
CREATE TABLE IF NOT EXISTS actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    cadence VARCHAR(20) NOT NULL, -- daily | weekly | monthly
    normal_instruction TEXT,
    minimum_instruction TEXT,
    recovery_instruction TEXT,
    target_time VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_actions_system_id ON actions(system_id);

-- =========================================================
-- ACTION INSTANCES (individual day-to-day occurrences / completions)
-- =========================================================
CREATE TABLE IF NOT EXISTS action_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending | completed | skipped | partial
    mode VARCHAR(20) NOT NULL DEFAULT 'normal', -- normal | minimum | recovery
    completed_at TIMESTAMPTZ,
    duration_minutes INTEGER,
    difficulty VARCHAR(20),
    obstacle TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_action_instances_action_id ON action_instances(action_id);
CREATE INDEX IF NOT EXISTS idx_action_instances_date ON action_instances(scheduled_date);

-- =========================================================
-- MILESTONES
-- =========================================================
CREATE TABLE IF NOT EXISTS milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    target_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'upcoming', -- upcoming | reached | missed
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_milestones_goal_id ON milestones(goal_id);

-- =========================================================
-- METRICS (definitions) + METRIC_RECORDS (values over time)
-- =========================================================
CREATE TABLE IF NOT EXISTS metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL, -- outcome | lead | system
    unit VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_metrics_goal_id ON metrics(goal_id);

CREATE TABLE IF NOT EXISTS metric_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_id UUID NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
    value NUMERIC NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    note TEXT
);
CREATE INDEX IF NOT EXISTS idx_metric_records_metric_id ON metric_records(metric_id);

-- =========================================================
-- REVIEWS (weekly review results)
-- =========================================================
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    planned_count INTEGER,
    completed_count INTEGER,
    missed_count INTEGER,
    execution_rate NUMERIC(5,2),
    goal_progress_note TEXT,
    what_worked TEXT,
    what_didnt TEXT,
    ai_diagnosis TEXT,
    ai_recommendation TEXT,
    raw_output JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_goal_id ON reviews(goal_id);

-- =========================================================
-- ADAPTATIONS (system changes recommended/applied over time)
-- =========================================================
CREATE TABLE IF NOT EXISTS adaptations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
    diagnosis_area VARCHAR(30), -- execution | system_design | strategy | resources | external | goal_assumptions
    recommended_change TEXT,
    applied BOOLEAN NOT NULL DEFAULT false,
    raw_output JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_adaptations_goal_id ON adaptations(goal_id);

-- =========================================================
-- ENGINE RUNS (observability/log of every AI engine call)
-- =========================================================
CREATE TABLE IF NOT EXISTS engine_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
    engine VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL, -- success | error | retried
    input_summary TEXT,
    output JSONB,
    error TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_engine_runs_goal_id ON engine_runs(goal_id);

-- =========================================================
-- SUBSCRIPTIONS (future billing)
-- =========================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    provider VARCHAR(30),
    provider_customer_id VARCHAR(255),
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
ALTER TABLE systems ALTER COLUMN review_schedule TYPE VARCHAR(255);
ALTER TABLE actions ALTER COLUMN target_time TYPE VARCHAR(255);
