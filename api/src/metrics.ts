import type { Db } from './db.js'

export type QueryRecord = { name: string; sql: string; params: unknown[] }

export type DateRange = { from: string; to: string } // inclusive YYYY-MM-DD
export type Segment = { plan?: string | null; platform?: string | null }

async function run<T extends object>(
  db: Db,
  log: QueryRecord[],
  name: string,
  sql: string,
  params: unknown[],
) {
  log.push({ name, sql: sql.trim(), params })
  const { rows } = await db.query<T>(sql, params)
  return rows
}

export function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const pct = (share: number | null) => (share === null ? null : Math.round(share * 1000) / 10)

const DAU_SQL = `
-- DAU per day ($1 start, $2 end, $3 include non-humans)
SELECT e.occurred_at::date AS day, count(DISTINCT e.user_id) AS dau
FROM events e
JOIN feature_events fe ON fe.event_name = e.event_name
WHERE fe.qualifying
  AND (e.actor_type = 'human' OR $3)
  AND e.occurred_at >= $1 AND e.occurred_at < $2
GROUP BY 1 ORDER BY 1`

const rollingSql = (label: 'wau' | 'mau', span: 6 | 29) => `
-- ${label.toUpperCase()} ending on $1 ($2 include non-humans)
SELECT count(DISTINCT e.user_id) AS ${label}
FROM events e
JOIN feature_events fe ON fe.event_name = e.event_name
WHERE fe.qualifying
  AND (e.actor_type = 'human' OR $2)
  AND e.occurred_at >= $1::date - interval '${span} days'
  AND e.occurred_at <  $1::date + interval '1 day'`

export async function activeUsers(db: Db, range: DateRange & { includeNonHuman?: boolean }) {
  const queries: QueryRecord[] = []
  const include = range.includeNonHuman ?? false
  const end = addDays(range.to, 1)
  const [series, wau, mau] = await Promise.all([
    run<{ day: string; dau: number }>(db, queries, 'DAU', DAU_SQL, [range.from, end, include]),
    run<{ wau: number }>(db, queries, 'WAU', rollingSql('wau', 6), [range.to, include]),
    run<{ mau: number }>(db, queries, 'MAU', rollingSql('mau', 29), [range.to, include]),
  ])
  return {
    series,
    dau: series.at(-1)?.dau ?? 0,
    wau: wau[0]?.wau ?? 0,
    mau: mau[0]?.mau ?? 0,
    asOf: range.to,
    queries,
  }
}

const ADOPTION_SQL = `
-- $1 start, $2 end, $3 feature id, $4 plan or NULL, $5 platform or NULL
WITH segment AS (
  SELECT id AS user_id FROM tracked_users
  WHERE ($4::text IS NULL OR plan = $4)
    AND ($5::text IS NULL OR platform = $5)
), active AS (
  SELECT DISTINCT e.user_id
  FROM events e
  JOIN feature_events fe ON fe.event_name = e.event_name
  JOIN segment s ON s.user_id = e.user_id
  WHERE fe.qualifying AND e.actor_type = 'human'
    AND e.occurred_at >= $1 AND e.occurred_at < $2
), used AS (
  SELECT DISTINCT e.user_id
  FROM events e
  JOIN segment s ON s.user_id = e.user_id
  WHERE e.feature_id = $3 AND e.actor_type = 'human'
    AND e.occurred_at >= $1 AND e.occurred_at < $2
)
SELECT (SELECT count(*) FROM used JOIN active USING (user_id)) AS users_used,
       (SELECT count(*) FROM active) AS users_active,
       (SELECT count(*) FROM used JOIN active USING (user_id))::numeric
         / NULLIF((SELECT count(*) FROM active), 0) AS adoption,
       (SELECT count(*) FROM events e
        JOIN segment s ON s.user_id = e.user_id
        WHERE e.feature_id = $3 AND e.actor_type = 'human'
          AND e.occurred_at >= $1 AND e.occurred_at < $2) AS frequency`

type AdoptionRow = {
  users_used: number
  users_active: number
  adoption: number | null
  frequency: number
}

export async function adoption(db: Db, input: DateRange & Segment & { featureId: number }) {
  const queries: QueryRecord[] = []
  const params = [
    input.from,
    addDays(input.to, 1),
    input.featureId,
    input.plan ?? null,
    input.platform ?? null,
  ]
  const [row] = await run<AdoptionRow>(db, queries, 'Adoption', ADOPTION_SQL, params)
  return {
    usersUsed: row?.users_used ?? 0,
    usersActive: row?.users_active ?? 0,
    adoptionPct: pct(row?.adoption ?? null),
    frequency: row?.frequency ?? 0,
    queries,
  }
}

export async function featureList(db: Db, input: DateRange & Segment) {
  const features = await run<{ id: number; key: string; name: string }>(
    db,
    [],
    'Features',
    'SELECT id, key, name FROM features ORDER BY id',
    [],
  )
  return Promise.all(
    features.map(async (feature) => ({
      ...feature,
      ...(await adoption(db, { ...input, featureId: feature.id })),
    })),
  )
}

const FUNNEL_SQL = `
-- $1 start, $2 end, $3 plan or NULL, $4 platform or NULL
WITH step1 AS (
  SELECT e.user_id, min(e.occurred_at) AS t1
  FROM events e JOIN tracked_users u ON u.id = e.user_id
  WHERE e.event_name = 'report_opened' AND e.actor_type = 'human'
    AND e.occurred_at >= $1 AND e.occurred_at < $2
    AND ($3::text IS NULL OR u.plan = $3)
    AND ($4::text IS NULL OR u.platform = $4)
  GROUP BY e.user_id
), step2 AS (
  SELECT s.user_id FROM step1 s
  JOIN events e ON e.user_id = s.user_id AND e.event_name = 'report_exported'
   AND e.occurred_at >= s.t1 AND e.occurred_at < s.t1 + interval '7 days'
  GROUP BY s.user_id
)
SELECT (SELECT count(*) FROM step1) AS opened,
       (SELECT count(*) FROM step2) AS exported`

export async function funnel(db: Db, input: DateRange & Segment) {
  const queries: QueryRecord[] = []
  const [row] = await run<{ opened: number; exported: number }>(
    db,
    queries,
    'Funnel',
    FUNNEL_SQL,
    [input.from, addDays(input.to, 1), input.plan ?? null, input.platform ?? null],
  )
  const opened = row?.opened ?? 0
  const exported = row?.exported ?? 0
  return {
    opened,
    exported,
    conversionPct: opened ? pct(exported / opened) : null,
    queries,
  }
}

// $3 is the exclusive end, so the last day in the range is $3 - 1. That keeps
// "used on the final day" at 0 days since last use rather than 1.
const DOTPLOT_SQL = `
-- Dot plot ($1 feature, $2 start, $3 end, $4 plan or NULL, $5 platform or NULL, $6 dot cap)
WITH dots AS (
  SELECT u.id AS user_id, u.external_id, u.plan, u.platform,
         count(*) AS interactions,
         ($3::date - 1) - max(e.occurred_at)::date AS days_since_last_use
  FROM events e JOIN tracked_users u ON u.id = e.user_id
  WHERE e.feature_id = $1 AND e.actor_type = 'human'
    AND e.occurred_at >= $2 AND e.occurred_at < $3
    AND ($4::text IS NULL OR u.plan = $4)
    AND ($5::text IS NULL OR u.platform = $5)
  GROUP BY u.id
)
SELECT *, count(*) OVER () AS total_dots
FROM dots ORDER BY random() LIMIT $6`

type Dot = {
  user_id: number
  external_id: string
  plan: string | null
  platform: string | null
  interactions: number
  days_since_last_use: number
  total_dots: number
}

export async function dotPlot(
  db: Db,
  input: DateRange & Segment & { featureId: number; cap: number },
) {
  const queries: QueryRecord[] = []
  const rows = await run<Dot>(db, queries, 'Dot plot', DOTPLOT_SQL, [
    input.featureId,
    input.from,
    addDays(input.to, 1),
    input.plan ?? null,
    input.platform ?? null,
    input.cap,
  ])
  return {
    dots: rows.map(({ total_dots: _total, ...dot }) => dot),
    total: rows[0]?.total_dots ?? 0,
    cap: input.cap,
    queries,
  }
}

const FEATURE_TREND_SQL = `
-- Feature users per day ($1 feature, $2 start, $3 end, $4 plan or NULL, $5 platform or NULL)
SELECT e.occurred_at::date AS day, count(DISTINCT e.user_id) AS users
FROM events e JOIN tracked_users u ON u.id = e.user_id
WHERE e.feature_id = $1 AND e.actor_type = 'human'
  AND e.occurred_at >= $2 AND e.occurred_at < $3
  AND ($4::text IS NULL OR u.plan = $4)
  AND ($5::text IS NULL OR u.platform = $5)
GROUP BY 1 ORDER BY 1`

export async function featureTrend(db: Db, input: DateRange & Segment & { featureId: number }) {
  const queries: QueryRecord[] = []
  const series = await run<{ day: string; users: number }>(db, queries, 'Feature users', FEATURE_TREND_SQL, [
    input.featureId,
    input.from,
    addDays(input.to, 1),
    input.plan ?? null,
    input.platform ?? null,
  ])
  return { series, queries }
}

const FEATURE_DAILY_SQL = `
-- Feature users per day and platform, for spotting drops ($1 start, $2 end)
SELECT e.occurred_at::date AS day, e.feature_id, f.name AS feature, u.platform,
       count(DISTINCT e.user_id) AS users
FROM events e
JOIN tracked_users u ON u.id = e.user_id
JOIN features f ON f.id = e.feature_id
WHERE e.actor_type = 'human' AND u.platform IS NOT NULL
  AND e.occurred_at >= $1 AND e.occurred_at < $2
GROUP BY 1, 2, 3, 4 ORDER BY 1`

export type DailyUsage = {
  day: string
  feature_id: number
  feature: string
  platform: string
  users: number
}

export type Anomaly = {
  featureId: number
  feature: string
  platform: string
  direction: 'drop' | 'spike'
  from: string
  to: string
  users: number
  baseline: number
  changePct: number
}

const MIN_BASELINE_USERS = 15
const ANOMALY_THRESHOLD = 0.5
const BASELINE_WEEKS = 4

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/** Compares each day with the same weekday in the weeks before it, so weekends don't alarm. */
export function detectAnomalies(rows: DailyUsage[], range: DateRange) {
  const lookup = new Map(rows.map((r) => [`${r.feature_id}|${r.platform}|${r.day}`, r.users]))
  const flagged: Anomaly[] = []
  for (const row of rows) {
    if (row.day < range.from || row.day > range.to) continue
    const history = Array.from({ length: BASELINE_WEEKS }, (_, week) =>
      lookup.get(`${row.feature_id}|${row.platform}|${addDays(row.day, -7 * (week + 1))}`),
    ).filter((value): value is number => value !== undefined)
    if (history.length < 2) continue
    const baseline = median(history)
    if (baseline < MIN_BASELINE_USERS) continue
    const change = (row.users - baseline) / baseline
    if (Math.abs(change) < ANOMALY_THRESHOLD) continue
    flagged.push({
      featureId: row.feature_id,
      feature: row.feature,
      platform: row.platform,
      direction: change < 0 ? 'drop' : 'spike',
      from: row.day,
      to: row.day,
      users: row.users,
      baseline,
      changePct: Math.round(change * 100),
    })
  }
  // Runs of neighbouring days are one incident, reported at its worst day.
  const merged: Anomaly[] = []
  for (const item of flagged) {
    const open = merged.find(
      (m) =>
        m.featureId === item.featureId &&
        m.platform === item.platform &&
        m.direction === item.direction &&
        addDays(m.to, 1) === item.from,
    )
    if (!open) merged.push({ ...item })
    else {
      open.to = item.to
      if (Math.abs(item.changePct) > Math.abs(open.changePct)) {
        Object.assign(open, { users: item.users, baseline: item.baseline, changePct: item.changePct })
      }
    }
  }
  return merged
}

export async function anomalies(db: Db, range: DateRange) {
  const queries: QueryRecord[] = []
  const rows = await run<DailyUsage>(db, queries, 'Unusual changes', FEATURE_DAILY_SQL, [
    addDays(range.from, -7 * BASELINE_WEEKS),
    addDays(range.to, 1),
  ])
  return { anomalies: detectAnomalies(rows, range), queries }
}

const RETENTION_SQL = `
-- Weekly retention ($1 first day, $2 last day, $3 plan or NULL, $4 platform or NULL)
WITH activity AS (
  SELECT e.user_id, (e.occurred_at::date - $1::date) / 7 AS week
  FROM events e
  JOIN feature_events fe ON fe.event_name = e.event_name
  JOIN tracked_users u ON u.id = e.user_id
  WHERE fe.qualifying AND e.actor_type = 'human'
    AND e.occurred_at >= $1 AND e.occurred_at < $2::date + 1
    AND ($3::text IS NULL OR u.plan = $3)
    AND ($4::text IS NULL OR u.platform = $4)
  GROUP BY 1, 2
), cohorts AS (
  SELECT user_id, min(week) AS cohort FROM activity GROUP BY 1
)
SELECT c.cohort, a.week - c.cohort AS weeks_later, count(*) AS users
FROM cohorts c JOIN activity a USING (user_id)
GROUP BY 1, 2 ORDER BY 1, 2`

export async function retention(db: Db, input: DateRange & Segment) {
  const queries: QueryRecord[] = []
  const rows = await run<{ cohort: number; weeks_later: number; users: number }>(
    db,
    queries,
    'Retention',
    RETENTION_SQL,
    [input.from, input.to, input.plan ?? null, input.platform ?? null],
  )
  const days = Math.round((Date.parse(input.to) - Date.parse(input.from)) / 86_400_000) + 1
  const weeks = Math.floor(days / 7) // A part-finished week would read as a false drop.

  const cohorts = Array.from({ length: weeks }, (_, cohort) => {
    const own = rows.filter((r) => r.cohort === cohort)
    const size = own.find((r) => r.weeks_later === 0)?.users ?? 0
    const cells = own
      .filter((r) => r.cohort + r.weeks_later < weeks)
      .map((r) => ({
        weeksLater: r.weeks_later,
        users: r.users,
        pct: size ? pct(r.users / size) : null,
      }))
    return { cohort, start: addDays(input.from, cohort * 7), size, cells }
  }).filter((c) => c.size > 0)

  const averages = Array.from({ length: weeks }, (_, weeksLater) => {
    const eligible = cohorts.filter((c) => c.cohort + weeksLater < weeks)
    const base = eligible.reduce((sum, c) => sum + c.size, 0)
    const kept = eligible.reduce(
      (sum, c) => sum + (c.cells.find((cell) => cell.weeksLater === weeksLater)?.users ?? 0),
      0,
    )
    return { weeksLater, pct: base ? pct(kept / base) : null }
  })
  return { weeks, cohorts, averages, queries }
}

const ACCOUNT_HEALTH_SQL = `
-- Account health ($1 last day, $2 plan or NULL)
WITH usage AS (
  SELECT e.user_id,
         max(e.occurred_at) AS last_event,
         bool_or(e.occurred_at >= $1::date - 6) AS active_now,
         bool_or(e.occurred_at >= $1::date - 13 AND e.occurred_at < $1::date - 6) AS active_before
  FROM events e
  JOIN feature_events fe ON fe.event_name = e.event_name
  WHERE fe.qualifying AND e.actor_type = 'human' AND e.occurred_at < $1::date + 1
  GROUP BY e.user_id
)
SELECT a.id, a.name, a.plan,
       count(*) AS seats,
       count(*) FILTER (WHERE x.active_now) AS active_now,
       count(*) FILTER (WHERE x.active_before) AS active_before,
       count(*) FILTER (WHERE x.last_event IS NULL OR x.last_event < $1::date - 13) AS lapsed,
       max(x.last_event) AS last_active
FROM accounts a
JOIN tracked_users u ON u.account_id = a.id AND u.actor_type = 'human'
LEFT JOIN usage x ON x.user_id = u.id
WHERE ($2::text IS NULL OR a.plan = $2)
GROUP BY a.id ORDER BY a.name`

type AccountRow = {
  id: number
  name: string
  plan: string
  seats: number
  active_now: number
  active_before: number
  lapsed: number
  last_active: string | null
}

export type Health = 'at_risk' | 'watch' | 'healthy'

const AT_RISK = { drop: 0.5, seats: 4 }
const WATCH = { drop: 0.25, seats: 3 }

export function classifyAccount({ active_now: now, active_before: before }: Pick<AccountRow, 'active_now' | 'active_before'>) {
  const lost = before - now
  const share = before ? lost / before : 0
  const changePct = before ? Math.round(((now - before) / before) * 100) : null
  const health: Health =
    share >= AT_RISK.drop && lost >= AT_RISK.seats
      ? 'at_risk'
      : share >= WATCH.drop && lost >= WATCH.seats
        ? 'watch'
        : 'healthy'
  return { health, changePct }
}

export async function accountHealth(db: Db, input: { to: string; plan?: string | null }) {
  const queries: QueryRecord[] = []
  const rows = await run<AccountRow>(db, queries, 'Account health', ACCOUNT_HEALTH_SQL, [
    input.to,
    input.plan ?? null,
  ])
  const accounts = rows.map((row) => ({ ...row, ...classifyAccount(row) }))
  const count = (health: Health) => accounts.filter((a) => a.health === health).length
  return {
    accounts,
    summary: { atRisk: count('at_risk'), watch: count('watch'), healthy: count('healthy') },
    queries,
  }
}

const ACCOUNT_USERS_SQL = `
-- People in one account ($1 account, $2 last day)
SELECT u.id, u.external_id, u.plan, u.platform, max(e.occurred_at) AS last_event,
       count(e.id) AS events,
       $2::date - max(e.occurred_at)::date AS days_since_last_use
FROM tracked_users u
LEFT JOIN events e ON e.user_id = u.id AND e.occurred_at < $2::date + 1
WHERE u.account_id = $1 AND u.actor_type = 'human'
GROUP BY u.id ORDER BY max(e.occurred_at) ASC NULLS FIRST`

export async function accountUsers(db: Db, input: { accountId: number; to: string }) {
  const queries: QueryRecord[] = []
  const [account] = await run<{ id: number; name: string; plan: string }>(
    db,
    queries,
    'Account',
    `SELECT id, name, plan FROM accounts WHERE id = $1`,
    [input.accountId],
  )
  const users = await run<Record<string, unknown>>(db, queries, 'People', ACCOUNT_USERS_SQL, [
    input.accountId,
    input.to,
  ])
  return { account: account ?? null, users, queries }
}

const TIMELINE_SQL = `
-- Timeline ($1 user)
SELECT occurred_at, event_name, properties
FROM events WHERE user_id = $1
ORDER BY occurred_at DESC LIMIT 200`

const TIMELINE_USER_SQL = `
-- Timeline header ($1 user)
SELECT u.id, u.external_id, u.plan, u.platform, u.actor_type,
       u.first_seen_at, u.last_seen_at, a.name AS account
FROM tracked_users u LEFT JOIN accounts a ON a.id = u.account_id
WHERE u.id = $1`

export async function timeline(db: Db, userId: number) {
  const queries: QueryRecord[] = []
  const [users, events] = await Promise.all([
    run<Record<string, unknown>>(db, queries, 'User', TIMELINE_USER_SQL, [userId]),
    run<Record<string, unknown>>(db, queries, 'Timeline', TIMELINE_SQL, [userId]),
  ])
  return { user: users[0] ?? null, events, queries }
}

// COALESCE so a user with no plan counts as control instead of a third NULL group.
const EXPORT_COMPLETION_SQL = `
-- $1 start, $2 end, $3 treated plan
WITH opened AS (
  SELECT e.user_id, COALESCE(u.plan = $3, false) AS treated, min(e.occurred_at) AS t1
  FROM events e JOIN tracked_users u ON u.id = e.user_id
  WHERE e.event_name = 'report_opened' AND e.actor_type = 'human'
    AND e.occurred_at >= $1 AND e.occurred_at < $2
  GROUP BY e.user_id, u.plan
)
SELECT o.treated, count(*) AS opened,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM events x
         WHERE x.user_id = o.user_id AND x.event_name = 'report_exported'
           AND x.occurred_at >= o.t1 AND x.occurred_at < o.t1 + interval '7 days'
       )) AS exported
FROM opened o GROUP BY o.treated`

type CompletionRow = { treated: boolean; opened: number; exported: number }

const WINDOW_DAYS = 20

function cell(rows: CompletionRow[], treated: boolean) {
  const row = rows.find((r) => r.treated === treated)
  const opened = row?.opened ?? 0
  const exported = row?.exported ?? 0
  return { opened, exported, ratePct: opened ? pct(exported / opened) : null }
}

const diff = (after: number | null, before: number | null) =>
  after === null || before === null ? null : Math.round((after - before) * 10) / 10

/** A 95% range for the net change, treating the four rates as independent samples. */
export function confidence(cells: { opened: number; exported: number }[], liftPts: number | null) {
  if (liftPts === null || cells.some((c) => c.opened === 0)) return null
  const variance = cells.reduce((sum, { opened, exported }) => {
    const rate = exported / opened
    return sum + (rate * (1 - rate)) / opened
  }, 0)
  const margin = 1.96 * Math.sqrt(variance) * 100
  const low = Math.round((liftPts - margin) * 10) / 10
  const high = Math.round((liftPts + margin) * 10) / 10
  const verdict = low > 0 ? 'positive' : high < 0 ? 'negative' : 'unclear'
  return { low, high, verdict } as const
}

export async function shippedRecommendations(db: Db) {
  const { rows } = await db.query<{
    id: number
    title: string
    shipped_on: string
    treated_plan: string
  }>(
    `SELECT id, title, shipped_at::date AS shipped_on, treated_plan
     FROM recommendations WHERE status = 'shipped' ORDER BY id`,
  )
  return rows
}

export async function measureChange(db: Db, recommendationId: number) {
  const queries: QueryRecord[] = []
  const [rec] = await run<{
    id: number
    title: string
    feature_key: string | null
    status: string
    treated_plan: string | null
    shipped_on: string | null
  }>(
    db,
    queries,
    'Recommendation',
    `
-- $1 recommendation
SELECT r.id, r.title, f.key AS feature_key, r.status, r.treated_plan,
       r.shipped_at::date AS shipped_on
FROM recommendations r LEFT JOIN features f ON f.id = r.feature_id
WHERE r.id = $1`,
    [recommendationId],
  )
  if (!rec) return { measurable: false as const, reason: 'Recommendation not found', queries }
  if (rec.status !== 'shipped' || !rec.shipped_on || !rec.treated_plan) {
    return {
      measurable: false as const,
      reason: 'Ship the recommendation to measure it.',
      queries,
    }
  }
  if (rec.feature_key !== 'reports') {
    return {
      measurable: false as const,
      reason: 'The prototype measures report export completion only.',
      queries,
    }
  }

  const [bounds] = await run<{ first_day: string | null; last_day: string | null }>(
    db,
    queries,
    'Data bounds',
    `SELECT min(occurred_at)::date AS first_day, max(occurred_at)::date AS last_day FROM events`,
    [],
  )
  const shipped = rec.shipped_on
  const daysBetween = (a: string, b: string) =>
    Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
  const days = bounds?.first_day && bounds.last_day
    ? Math.min(
        WINDOW_DAYS,
        daysBetween(bounds.first_day, shipped),
        daysBetween(shipped, bounds.last_day) + 1,
      )
    : 0
  if (days < 1) {
    return {
      measurable: false as const,
      reason: 'The ship date needs data on both sides of it.',
      queries,
    }
  }

  const windows = {
    before: { from: addDays(shipped, -days), to: addDays(shipped, -1) },
    after: { from: shipped, to: addDays(shipped, days - 1) },
  }
  const completion = (start: string, end: string, label: string) =>
    run<CompletionRow>(db, queries, label, EXPORT_COMPLETION_SQL, [start, end, rec.treated_plan])
  const before = await completion(windows.before.from, shipped, 'Export completion, before')
  const after = await completion(shipped, addDays(shipped, days), 'Export completion, after')

  const group = (treated: boolean) => {
    const b = cell(before, treated)
    const a = cell(after, treated)
    return { before: b, after: a, changePts: diff(a.ratePct, b.ratePct) }
  }
  const treated = group(true)
  const control = group(false)
  const liftPts = diff(treated.changePts, control.changePts)
  return {
    measurable: true as const,
    recommendationId: rec.id,
    title: rec.title,
    shippedOn: shipped,
    treatedPlan: rec.treated_plan,
    windowDays: days,
    windows,
    treated,
    control,
    liftPts,
    confidence: confidence(
      [treated.before, treated.after, control.before, control.after],
      liftPts,
    ),
    caveat:
      'This is an observational comparison between plans, not proof of cause. Other changes in the same period could explain some or all of the difference. The 95% range is a guide, because some people appear in both windows.',
    queries,
  }
}
