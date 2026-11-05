# Behavior Analytics

An AI user-behavior analytics prototype that closes the loop most analytics tools leave open:

**spot a drop-off → ask why → get an evidence-labelled answer → approve a fix → measure whether it worked.**

Most dashboards stop at "here is a chart". This one carries on. It points out what is wrong, answers
questions in plain language without making anything up, and checks afterwards whether the fix helped.

> All data in this repo is **synthetic**. Every story in it, such as the export drop-off, the lift
> after the fix and the at-risk accounts, is planted by the seed script so the demo has something
> to find. None of it is a real finding.

## Contents

- [The idea in one minute](#the-idea-in-one-minute)
- [Quick start](#quick-start)
- [A guided tour](#a-guided-tour)
- [How the AI assistant stays honest](#how-the-ai-assistant-stays-honest)
- [How the numbers are defined](#how-the-numbers-are-defined)
- [Architecture](#architecture)
- [The synthetic data](#the-synthetic-data)
- [Sending your own events (SDK)](#sending-your-own-events-sdk)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Configuration](#configuration)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)

## The idea in one minute

A Head of Product opens the dashboard and the app tells them what to look at first. In the demo:

1. **Overview** shows daily, weekly and monthly active users, plus a ranked list of problems.
2. **Reports** has plenty of users who open a report, but only about one in ten exports it.
3. A **dot plot** shows every user as one dot. Clicking a lapsed user opens their event timeline.
4. The **assistant** answers "Why aren't users exporting reports?" in three clearly separated groups:
   - **Measured**: facts, each with a *View query* link to the exact SQL behind it
   - **Hypothesis**: possible causes, each naming the evidence needed to confirm it
   - **Unknown**: what the data cannot tell us
5. The answer becomes a **recommendation**, which must be approved before it can ship.
6. After shipping, the app compares export rates **before and after, against a control group**, with a
   95% range and a plain verdict. The result always carries a caveat that it is an observational
   comparison, not proof of cause.

Every number on screen can show the query that produced it.

## Quick start

You need **Node 20.12 or newer** and **Docker Desktop** running.

```bash
npm install
npm run setup    # starts PostgreSQL in Docker and loads the demo data
npm run dev      # dashboard at http://localhost:5173
```

That is all. The assistant works without any key, using a scripted answer for the demo questions
(see below). To switch on the live model, add your key:

```bash
# in .env (copy .env.example first if you do not have one)
NEBIUS_API_KEY=your-key-here
NEBIUS_MODEL=openai/gpt-oss-120b   # any tool-calling model in your Nebius catalog
```

Restart `npm run dev`. The Assistant screen then shows a green **Live model** badge.

To reset the demo between runs, use `npm run seed`. It clears recommendations and rebuilds the same
data.

## A guided tour

Click **Demo script** in the sidebar for an eight-step walkthrough that takes about ten minutes.

| Screen | What it answers |
| --- | --- |
| **Overview** | Who is active? What should we fix first? A toggle shows how much agent and bot traffic inflates the numbers. |
| **Features** | Which features are used, how often, by what share of active users. Sortable, with exact counts. |
| **Feature detail** | The Reports funnel, a daily trend that marks unusual drops, and the dot plot with plan and platform filters. |
| **Retention** | Of the people who started in a given week, how many kept coming back, week by week. |
| **Accounts** | Which customers are growing and which are going quiet, the people behind each one, and a CSV export. |
| **Assistant** | Plain-language answers with evidence labels, a weekly brief, and a *Copy summary* button for Slack or email. |
| **Recommendations** | Draft, approve, ship, then the before/after result against a control group. |

### Things that make it usable, not just good-looking

- **What to fix first:** ranked problems on the Overview, sized by the number of users affected, each
  with *Investigate*, *Ask* and *Query* links. Live drops rank first.
- **Usage-drop detection:** each day is compared with the same weekday in earlier weeks, so a quiet
  weekend never raises an alarm.
- **Filters live in the URL.** Any view can be shared as a link.
- **Every screen has loading, empty and error states.** Refreshing data keeps the old view in place
  at reduced opacity instead of flashing a skeleton.
- Light and dark themes, and layouts that fit phone width.

## How the AI assistant stays honest

The main risk with an AI analyst is a confident answer built on numbers it invented. The assistant is
built so that cannot reach the screen.

```mermaid
sequenceDiagram
    participant U as User
    participant A as API
    participant M as Language model
    participant D as Database (read-only)

    U->>A: "Why aren't users exporting reports?"
    A->>M: Question, rules, and nine function schemas
    M->>A: Call get_funnel(from, to)
    A->>D: Fixed, parameterised SQL
    D-->>A: Rows
    A->>M: Result plus a query id (q1)
    M->>A: Insight card as JSON
    A->>A: Verify every fact and number
    A-->>U: Card, with the SQL behind each fact
```

**What the model can and cannot do**

- It gets **nine typed functions** and nothing else:
  `get_active_users`, `get_feature_adoption`, `get_funnel`, `compare_segments`, `compare_funnel`,
  `get_retention`, `get_account_health`, `get_priorities` and `measure_change`.
- It **never writes SQL** and never sees a table name. The SQL lives on the server, and each function
  runs through a **read-only database role**.
- It is told which recommendations have shipped, so "did the change work?" maps to `measure_change`.

**What the server checks before showing an answer**

| Check | What happens if it fails |
| --- | --- |
| Each fact cites a query that was run **in this same request** | The model is sent the problem and asked to fix it |
| Every number in a fact **matches what that query returned** (rounding allowed) | Same |
| Facts contain **no causal language** ("because", "caused by"), since causes belong under Hypothesis | Same |
| Numbers in hypotheses and unknowns also exist in some query result | Same |
| No internal function names leak into text meant for people | Same |

The model gets two chances to correct itself. If it still fails, nothing is shown.

**When the model is unavailable**

- With no key, or if the model fails, the two built-in questions (*Why aren't users exporting
  reports?* and *Give me this week's brief*) fall back to a **scripted card**. It is built by the same
  functions, so its numbers are live and verified in the same way.
- Any other question returns a clear error rather than a guess.
- Questions unrelated to the product, such as a request for a poem, are politely declined.

## How the numbers are defined

All queries live in one module, [`api/src/metrics.ts`](api/src/metrics.ts), and the API returns the SQL
and parameters alongside every result.

| Metric | Definition |
| --- | --- |
| **Active user** | A *human* with at least one *qualifying* event in the window. Agent, bot and service traffic is excluded unless the Overview toggle includes it. |
| **DAU / WAU / MAU** | Distinct active users per day, and over the 7 and 30 days ending on the chosen date. |
| **Adoption** | Active users who used the feature, divided by all active users in the period. |
| **Funnel** | Users who opened a report, and of those, users who exported within **7 days of their first open**. |
| **Dot plot** | One dot per user: x is interactions, y is days since last use. Dots are capped, and the exact total is shown ("Showing 755 of 755"). |
| **Retention** | Users grouped by the week of their first activity, then the share still active in each later week. An unfinished final week is left out so it cannot read as a false drop. |
| **Account health** | Active seats this week against the week before. **At risk** means at least half lost and at least 4 seats. **Watch** means at least a quarter lost and at least 3 seats. |
| **Usage drop** | A feature's daily users on a platform falling 50% or more below the median for the same weekday over the previous four weeks. Needs a baseline of at least 15 users. Adjacent days merge into one incident. |
| **Before / after** | Two equal windows either side of the ship date (20 days each on the demo data). Export completion is split into treated (the chosen plan) and control (everyone else). **Net change = treated change minus control change.** |
| **Confidence** | A 95% range around the net change, with a verdict of clear improvement, clear decline, or too close to call. |

The thresholds for usage drops and at-risk accounts are sensible defaults, and each is a named
constant you can change.

## Architecture

```mermaid
flowchart LR
    subgraph Clients
        W[React dashboard]
        S[TypeScript SDK]
    end
    API[Fastify API<br/>validation, metrics,<br/>assistant, recommendations]
    PG[(PostgreSQL)]
    LLM[Nebius LLM<br/>tool calling]

    W -- REST --> API
    S -- events --> API
    API -- SQL --> PG
    API -- function schemas --> LLM
```

Only the API touches the database and the model. The dashboard and the SDK never do.

| Layer | Choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS 4, Radix UI primitives, Recharts, Geist font |
| API | Node, TypeScript, Fastify 5, `pg` with plain SQL, zod for validation |
| Database | PostgreSQL 16, run by Docker Compose |
| Assistant | Any OpenAI-compatible tool-calling model, defaulting to Nebius Token Factory |
| Tests | Vitest |

**Two database roles.** The API uses a read-write role for ingestion, insights and recommendations,
and a read-only role (`analytics_ro`) for every metric and every assistant function. The read-only
role also has a 10 second statement timeout.

**Approval gate.** A recommendation moves `draft → approved → shipped`. The rule is enforced inside
the SQL `UPDATE ... WHERE status = 'approved'`, so it cannot be bypassed or raced. Shipping an
unapproved recommendation returns `409`.

## The synthetic data

`npm run seed` builds a demo project from a fixed random seed, so **every run produces identical
data**.

| | |
| --- | --- |
| Size | About 1,000 users in 60 accounts, 60 days of events (2026-08-29 to 2026-10-27), roughly 104,000 events |
| Plans and platforms | Free, pro and enterprise, on web and mobile |
| Features | Reports, Dashboards and Sharing |
| Events | `report_opened`, `report_exported`, `dashboard_viewed`, `share_clicked` |
| Actors | Mostly humans, plus a small share of `ai_agent`, `bot` and `service` |

Five stories are planted for the demo to find:

1. **Open but not exported.** Most active users open Reports, and only about one in ten exports.
2. **A planted lift.** From day 41 (2026-10-08) the export rate rises for pro-plan users only, from
   roughly 9% to roughly 28%, while control stays flat. Ship on that date to see it.
3. **Agent traffic.** Bots and agents inflate DAU until the human-only filter is applied.
4. **An incident.** Dashboards usage on mobile collapses for two days (Oct 20 to 21).
5. **Fading accounts.** A few customers, one of them enterprise, lose most of their active seats
   near the end.

The app treats 2026-10-27 as "today".

## Sending your own events (SDK)

[`sdk/index.ts`](sdk/index.ts) is a small TypeScript client.

```ts
import { Analytics } from './sdk'

const analytics = new Analytics({
  apiUrl: 'http://localhost:4000',
  writeKey: 'demo_write_key',
})

await analytics.identify('user_123', { plan: 'pro', platform: 'web' })
analytics.track('report_opened', { report: 'Weekly revenue' })  // batched
await analytics.flush()                                          // or wait for the timer
```

- Events are batched and flushed within a second, comfortably inside the five-second target.
- An event name that is **not mapped to a feature** is refused with `422` and a reason, and nothing in
  that batch is stored. This keeps inconsistent names from corrupting the metrics.
- The actor type (`human`, `ai_agent`, `bot`, `service`) comes from the user's traits and is copied
  onto each event.

Try it against a running API with `npm run sdk:demo`. It sends two real events, then shows the API
refusing an unmapped one.

## API reference

All analytics responses include a `queries` array with the SQL and parameters behind each number.
Errors always have the shape `{ "error": "...", "reason": "..." }`.

| Method and path | Purpose |
| --- | --- |
| `POST /v1/events` | Accept a batch of events (needs the `x-write-key` header) |
| `POST /v1/identify` | Create or update a user and their traits |
| `GET /api/meta` | Date bounds, plans, platforms and the assistant mode |
| `GET /api/metrics/active-users` | DAU series, WAU and MAU. `includeNonHuman` adds agent and bot traffic |
| `GET /api/features` | Features with adoption, frequency and exact counts |
| `GET /api/funnels/reports` | Open-to-export funnel |
| `GET /api/features/:id/dotplot` | One dot per user, with `plan`, `platform` and `cap` |
| `GET /api/features/:id/trend` | Daily users plus any usage drops |
| `GET /api/users/:id/timeline` | One user's recent events |
| `GET /api/priorities` | What to fix first |
| `GET /api/retention` | Weekly cohorts |
| `GET /api/accounts`, `GET /api/accounts/:id/users` | Account health, and the people in one account |
| `POST /api/assistant/ask` | Answer a question with an insight card |
| `POST /api/recommendations` | Create a draft from an insight |
| `GET /api/recommendations` | List with status |
| `POST /api/recommendations/:id/approve` | Approve a draft |
| `POST /api/recommendations/:id/ship` | Record the ship date and treated plan. Refused unless approved |
| `GET /api/recommendations/:id/measurement` | Before/after result with the control comparison |

## Project structure

```
.
├── api/
│   ├── db/schema.sql          # seven tables, indexes and the read-only role
│   ├── src/
│   │   ├── metrics.ts         # every metric query, in one place
│   │   ├── priorities.ts      # "what to fix first"
│   │   ├── app.ts             # routes and validation
│   │   ├── seed.ts            # the synthetic project
│   │   └── assistant/         # functions, guardrails, scripted fallback, model loop
│   └── test/                  # fixture, API, assistant and guardrail tests
├── web/src/
│   ├── pages/                 # Overview, Features, FeatureDetail, Retention, Accounts, ...
│   ├── components/            # DotPlot, InsightCard, TrendChart, BeforeAfterCard, ...
│   └── lib/                   # API client, URL-held filters, helpers
├── sdk/                       # TypeScript client and a runnable demo
├── docker-compose.yml         # PostgreSQL
└── .env.example
```

## Testing

```bash
npm run setup    # the database must be running
npm test         # 66 tests
npm run typecheck
```

The tests use their own `analytics_test` database, so they never touch the demo data. They cover:

- **Metric queries** against a tiny fixture world whose answers can be counted by hand
- **The approval gate**: an unapproved recommendation cannot ship
- **Ingestion**: unmapped events are refused, and actor type is copied onto events
- **The assistant**, against a stand-in model server: citations, corrections, declined questions,
  scripted fallbacks, and the check that the model never sees SQL or table names
- **The guardrails**, including invented numbers, causal claims and leaked function names

## Configuration

Everything is optional. Without a `.env` the defaults below apply.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEBIUS_API_KEY` | *(empty)* | Turns on the live assistant. Empty means scripted mode |
| `NEBIUS_BASE_URL` | `https://api.tokenfactory.nebius.com/v1` | Any OpenAI-compatible endpoint |
| `NEBIUS_MODEL` | `openai/gpt-oss-120b` | A tool-calling model, with its organisation prefix |
| `DATABASE_URL` | `postgres://analytics:analytics@localhost:5433/analytics` | Read-write connection |
| `DATABASE_URL_READONLY` | `postgres://analytics_ro:analytics_ro@localhost:5433/analytics` | Read-only connection |
| `WRITE_KEY` | `demo_write_key` | Sent by the SDK in `x-write-key` |
| `PORT` | `4000` | API port |

`.env` is git-ignored. Never commit a real key.

## Limitations

This is a demo, not a production system.

- **No login, roles or tenant isolation.** One demo project, and the API listens on localhost only.
  The database passwords in `docker-compose.yml` are for local use.
- **The measurement is observational.** It supports one rule (a plan is the treated group) and
  measures export completion only. The 95% range treats the four rates as independent samples,
  though some people appear in both windows, so use it as a guide.
- **The live assistant varies.** Wording and the number of facts differ from run to run. The numbers
  are always verified, but the phrasing is not scripted. It also needs internet access.
- **Thresholds are defaults.** The usage-drop and at-risk rules are simple and explainable, not
  learned from data.
- **Not built:** a production ingestion queue, deduplication, ClickHouse, custom metrics, session
  replay, consent and PII redaction, and tickets in Jira or Linear.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm run setup` fails with a Docker error | Start Docker Desktop and run it again |
| Port `5433` is already in use | Change the host port in `docker-compose.yml`, and the two database URLs in `.env` |
| Dashboard says it could not reach the API | Run `npm run dev` from the repo root, so the API and the web app start together |
| Assistant shows "Scripted mode" | Check `NEBIUS_API_KEY` in `.env` and restart `npm run dev` |
| Assistant says it can only answer two questions | That is scripted mode. Add a key for open questions |
| Numbers look stale or odd | `npm run seed` rebuilds the data |
| Want a completely fresh database | `docker compose down -v`, then `npm run setup` |
