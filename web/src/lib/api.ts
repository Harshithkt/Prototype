export type QueryInfo = { name?: string; id?: string; function?: string; sql: string; params: unknown }

export type Meta = {
  dataStart: string
  dataEnd: string
  shipDate: string
  plans: string[]
  platforms: string[]
  synthetic: boolean
  assistant: { mode: 'live' | 'scripted'; model?: string }
}

export type ActiveUsers = {
  series: { day: string; dau: number }[]
  dau: number
  wau: number
  mau: number
  asOf: string
  queries: QueryInfo[]
}

export type Feature = {
  id: number
  key: string
  name: string
  usersUsed: number
  usersActive: number
  adoptionPct: number | null
  frequency: number
  queries: QueryInfo[]
}

export type FeatureTrend = {
  series: { day: string; users: number }[]
  anomalies: Anomaly[]
  queries: QueryInfo[]
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

export type Priority = {
  id: string
  kind: 'incident' | 'funnel' | 'adoption' | 'accounts'
  title: string
  detail: string
  usersAffected: number
  href: string
  question: string
  queries: QueryInfo[]
}

export type Retention = {
  weeks: number
  cohorts: {
    cohort: number
    start: string
    size: number
    cells: { weeksLater: number; users: number; pct: number | null }[]
  }[]
  averages: { weeksLater: number; pct: number | null }[]
  queries: QueryInfo[]
}

export type Health = 'at_risk' | 'watch' | 'healthy'

export type Account = {
  id: number
  name: string
  plan: string
  seats: number
  active_now: number
  active_before: number
  lapsed: number
  last_active: string | null
  health: Health
  changePct: number | null
}

export type AccountList = {
  accounts: Account[]
  summary: { atRisk: number; watch: number; healthy: number }
  queries: QueryInfo[]
}

export type AccountUser = {
  id: number
  external_id: string
  plan: string | null
  platform: string | null
  last_event: string | null
  events: number
  days_since_last_use: number | null
}

export type AccountDetail = {
  account: { id: number; name: string; plan: string }
  users: AccountUser[]
  queries: QueryInfo[]
}

export type Funnel = {
  opened: number
  exported: number
  conversionPct: number | null
  queries: QueryInfo[]
}

export type Dot = {
  user_id: number
  external_id: string
  plan: string | null
  platform: string | null
  interactions: number
  days_since_last_use: number
}

export type DotPlotData = { dots: Dot[]; total: number; cap: number; queries: QueryInfo[] }

export type TimelineEvent = {
  occurred_at: string
  event_name: string
  properties: Record<string, unknown>
}

export type Timeline = {
  user: {
    id: number
    external_id: string
    plan: string | null
    platform: string | null
    actor_type: string
    first_seen_at: string | null
    last_seen_at: string | null
    account: string | null
  }
  events: TimelineEvent[]
  queries: QueryInfo[]
}

export type Insight = {
  id: number
  question: string
  created_at: string
  facts: { text: string; query_id: string }[]
  hypotheses: { text: string; evidence_needed: string }[]
  unknowns: { text: string }[]
  queries: QueryInfo[]
  suggestion?: { title: string; detail: string; feature: string }
  mode: 'live' | 'scripted'
  model?: string
  notice?: string
}

export type RecommendationStatus = 'draft' | 'approved' | 'shipped'

export type Recommendation = {
  id: number
  insight_id: number | null
  feature_id: number | null
  feature_name: string | null
  question: string | null
  title: string
  detail: string | null
  treated_plan: string | null
  status: RecommendationStatus
  approved_at: string | null
  shipped_at: string | null
}

type GroupCell = { opened: number; exported: number; ratePct: number | null }
type Group = { before: GroupCell; after: GroupCell; changePts: number | null }

export type Measurement =
  | { measurable: false; reason: string; queries: QueryInfo[] }
  | {
      measurable: true
      recommendationId: number
      title: string
      shippedOn: string
      treatedPlan: string
      windowDays: number
      windows: { before: { from: string; to: string }; after: { from: string; to: string } }
      treated: Group
      control: Group
      liftPts: number | null
      confidence: { low: number; high: number; verdict: 'positive' | 'negative' | 'unclear' } | null
      caveat: string
      queries: QueryInfo[]
    }

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new ApiError('Could not reach the API. Is it running?', 0)
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(body?.reason ?? `Request failed with ${response.status}`, response.status)
  }
  return body as T
}

const get = <T,>(path: string, params: Record<string, string | undefined> = {}) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  const qs = search.toString()
  return request<T>(qs ? `${path}?${qs}` : path)
}

const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

export type Range = { from: string; to: string }
export type Segment = { plan?: string; platform?: string }

export const api = {
  meta: () => get<Meta>('/api/meta'),
  activeUsers: (range: Range, includeNonHuman: boolean) =>
    get<ActiveUsers>('/api/metrics/active-users', {
      ...range,
      includeNonHuman: String(includeNonHuman),
    }),
  features: (params: Range & Segment) =>
    get<{ features: Feature[]; queries: QueryInfo[] }>('/api/features', params),
  funnel: (params: Range & Segment) => get<Funnel>('/api/funnels/reports', params),
  dotPlot: (id: number, params: Range & Segment) =>
    get<DotPlotData>(`/api/features/${id}/dotplot`, params),
  featureTrend: (id: number, params: Range & Segment) =>
    get<FeatureTrend>(`/api/features/${id}/trend`, params),
  priorities: (range: Range) =>
    get<{ items: Priority[]; queries: QueryInfo[] }>('/api/priorities', range),
  retention: (params: Segment) => get<Retention>('/api/retention', params),
  accounts: (plan?: string) => get<AccountList>('/api/accounts', { plan }),
  accountUsers: (id: number) => get<AccountDetail>(`/api/accounts/${id}/users`),
  timeline: (id: number) => get<Timeline>(`/api/users/${id}/timeline`),
  ask: (question: string) => post<Insight>('/api/assistant/ask', { question }),
  recommendations: () => get<{ recommendations: Recommendation[] }>('/api/recommendations'),
  createRecommendation: (body: {
    insightId: number
    featureId: number
    title: string
    detail?: string
  }) => post<Recommendation>('/api/recommendations', body),
  approve: (id: number) => post<Recommendation>(`/api/recommendations/${id}/approve`),
  ship: (id: number, body: { shippedOn: string; treatedPlan: string }) =>
    post<Recommendation>(`/api/recommendations/${id}/ship`, body),
  measurement: (id: number) => get<Measurement>(`/api/recommendations/${id}/measurement`),
}
