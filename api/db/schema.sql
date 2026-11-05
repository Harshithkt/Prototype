CREATE TABLE accounts (
  id serial PRIMARY KEY,
  name text NOT NULL,
  plan text NOT NULL
);

CREATE TABLE tracked_users (
  id serial PRIMARY KEY,
  external_id text NOT NULL UNIQUE,
  account_id int REFERENCES accounts(id),
  actor_type text NOT NULL DEFAULT 'human'
    CHECK (actor_type IN ('human','ai_agent','bot','service')),
  plan text,
  platform text,
  first_seen_at timestamptz,
  last_seen_at timestamptz
);

CREATE TABLE features (
  id serial PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE feature_events (
  event_name text PRIMARY KEY,
  feature_id int NOT NULL REFERENCES features(id),
  qualifying boolean NOT NULL DEFAULT true
);

CREATE TABLE events (
  id bigserial PRIMARY KEY,
  user_id int NOT NULL REFERENCES tracked_users(id),
  account_id int REFERENCES accounts(id),
  event_name text NOT NULL,
  feature_id int REFERENCES features(id),
  properties jsonb NOT NULL DEFAULT '{}',
  actor_type text NOT NULL DEFAULT 'human',
  occurred_at timestamptz NOT NULL
);

CREATE INDEX events_time ON events (occurred_at);
CREATE INDEX events_user_time ON events (user_id, occurred_at);
CREATE INDEX events_feature_time ON events (feature_id, occurred_at);

CREATE TABLE insights (
  id serial PRIMARY KEY,
  question text NOT NULL,
  facts jsonb NOT NULL,        -- [{text, query_id}]
  hypotheses jsonb NOT NULL,   -- [{text, evidence_needed}]
  unknowns jsonb NOT NULL,     -- [{text}]
  queries jsonb NOT NULL,      -- [{id, function, params, sql}]
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recommendations (
  id serial PRIMARY KEY,
  insight_id int REFERENCES insights(id),
  feature_id int REFERENCES features(id),
  title text NOT NULL,
  detail text,
  treated_plan text,           -- the rollout segment; everyone else is control
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','shipped')),
  approved_at timestamptz,
  shipped_at timestamptz
);

-- The read-only role behind every analytics function, including the assistant's.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'analytics_ro') THEN
    CREATE ROLE analytics_ro LOGIN PASSWORD 'analytics_ro';
  END IF;
END
$$;
ALTER ROLE analytics_ro SET default_transaction_read_only = on;
ALTER ROLE analytics_ro SET statement_timeout = '10s';
GRANT USAGE ON SCHEMA public TO analytics_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_ro;
