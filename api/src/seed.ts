import { config, demo } from './config.js'
import { addDays, funnel, measureChange, activeUsers } from './metrics.js'
import { createPool } from './db.js'

// Synthetic project: about 1,000 users, 60 accounts, 60 days, roughly 100K events.
// Three stories are planted for the demo to find:
//   1. Open but not exported: about one in ten openers exports within 7 days.
//   2. A planted lift: from day 41 the export rate rises for pro users only.
//   3. Agent traffic: non-human actors inflate DAU until they are filtered out.
//   4. An incident: Dashboards usage on mobile collapses for two days.
//   5. Fading accounts: a few customers lose most of their active seats near the end.

const SEED = 20261029
const DAYS = 60
const LIFT_DAY = 41
const ACCOUNTS = 60
const HUMANS = 940
const NON_HUMANS = { ai_agent: 30, bot: 20, service: 10 } as const

const INCIDENT = { event: 'dashboard_viewed', platform: 'mobile', days: [53, 54], keep: 0.12 }
const FADE_FROM_DAY = 52
const FADING_MIN_SEATS = 12
const FADING_SHARE = 0.8

const EXPORT_PER_OPEN = 0.0155
const EXPORT_PER_OPEN_LIFTED = 0.05

// mulberry32: small, fast, and identical on every machine.
function createRandom(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = createRandom(SEED)
const chance = (p: number) => random() < p
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))
const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)] as T

const FIRST_NAMES = ['Alder', 'Birch', 'Cobalt', 'Delta', 'Ember', 'Fable', 'Granite', 'Harbor', 'Indigo', 'Juniper', 'Kestrel', 'Larch']
const LAST_NAMES = ['Freight', 'Health', 'Labs', 'Logistics', 'Media', 'Partners', 'Retail', 'Robotics', 'Software', 'Systems']

type Account = { id: number; name: string; plan: string }
type Archetype = { weekday: number; weekend: number; sessions: [number, number]; churnsOn?: number }
type User = {
  id: number
  externalId: string
  account: Account
  actorType: string
  plan: string
  platform: string
  startDay: number
  archetype: Archetype
  reportAffinity: number
  dashboardAffinity: number
  shareAffinity: number
}
type Event = {
  user: User
  name: string
  properties: Record<string, unknown>
  at: Date
}

const FEATURES = [
  { id: 1, key: 'reports', name: 'Reports' },
  { id: 2, key: 'dashboards', name: 'Dashboards' },
  { id: 3, key: 'sharing', name: 'Sharing' },
]
const FEATURE_EVENTS: Record<string, number> = {
  report_opened: 1,
  report_exported: 1,
  dashboard_viewed: 2,
  share_clicked: 3,
}

const REPORTS = ['Weekly revenue', 'Pipeline health', 'Support backlog', 'Churn risk', 'Usage by team']
const DASHBOARDS = ['Executive summary', 'Growth', 'Customer health']

function buildAccounts(): Account[] {
  const names = new Set<string>()
  while (names.size < ACCOUNTS) names.add(`${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`)
  return [...names].map((name, index) => ({
    id: index + 1,
    name,
    plan: index % 6 === 0 ? 'enterprise' : index % 2 === 0 ? 'free' : 'pro',
  }))
}

function humanArchetype(): Archetype {
  const roll = random()
  if (roll < 0.15) return { weekday: 0.85, weekend: 0.25, sessions: [2, 4] }
  if (roll < 0.55) return { weekday: 0.55, weekend: 0.12, sessions: [1, 3] }
  if (roll < 0.85) return { weekday: 0.15, weekend: 0.03, sessions: [1, 1] }
  return { weekday: 0.55, weekend: 0.12, sessions: [1, 3], churnsOn: between(15, 55) }
}

function buildUsers(accounts: Account[]): User[] {
  const users: User[] = []
  // Enterprise accounts carry more seats, so plans end up roughly balanced.
  const weighted = accounts.flatMap((account) =>
    Array.from({ length: account.plan === 'enterprise' ? 4 : account.plan === 'pro' ? 2 : 1 }, () => account),
  )
  for (let n = 1; n <= HUMANS; n++) {
    const account = pick(weighted)
    users.push({
      id: n,
      externalId: `usr_${String(n).padStart(4, '0')}`,
      account,
      actorType: 'human',
      plan: account.plan,
      platform: chance(0.68) ? 'web' : 'mobile',
      startDay: chance(0.7) ? 1 : between(2, 50),
      archetype: humanArchetype(),
      reportAffinity: chance(0.86) ? 0.72 : 0.01,
      dashboardAffinity: chance(0.62) ? 0.62 : 0,
      shareAffinity: chance(0.3) ? 0.16 : 0,
    })
  }
  let id = HUMANS
  for (const [actorType, count] of Object.entries(NON_HUMANS)) {
    for (let n = 1; n <= count; n++) {
      id += 1
      const account = pick(accounts)
      users.push({
        id,
        externalId: `${actorType}_${String(n).padStart(3, '0')}`,
        account,
        actorType,
        plan: account.plan,
        platform: 'web',
        startDay: between(1, 12),
        archetype: { weekday: 0.96, weekend: 0.9, sessions: [3, 5] },
        reportAffinity: 0.9,
        dashboardAffinity: 0.8,
        shareAffinity: 0,
      })
    }
  }
  return users
}

const dayStart = (day: number) => new Date(`${addDays(demo.dataStart, day - 1)}T00:00:00Z`)
const isWeekend = (day: number) => [0, 6].includes(dayStart(day).getUTCDay())
const minutes = (date: Date, count: number) => new Date(date.getTime() + count * 60_000)

function session(user: User, day: number, events: Event[]) {
  const nonHuman = user.actorType !== 'human'
  let at = minutes(dayStart(day), between(nonHuman ? 0 : 7 * 60, nonHuman ? 22 * 60 : 21 * 60))
  const device = { platform: user.platform }

  if (chance(user.reportAffinity)) {
    const report = pick(REPORTS)
    const opens = chance(0.25) ? 2 : 1
    for (let i = 0; i < opens; i++) {
      events.push({ user, name: 'report_opened', at, properties: { report, ...device } })
      const lifted = user.plan === 'pro' && day >= LIFT_DAY
      if (chance(lifted ? EXPORT_PER_OPEN_LIFTED : EXPORT_PER_OPEN)) {
        const format = pick(['pdf', 'csv', 'xlsx'])
        events.push({
          user,
          name: 'report_exported',
          at: minutes(at, between(1, 12)),
          properties: { report, format, ...device },
        })
      }
      at = minutes(at, between(2, 18))
    }
  }
  if (chance(user.dashboardAffinity)) {
    const views = between(1, 4)
    for (let i = 0; i < views; i++) {
      events.push({ user, name: 'dashboard_viewed', at, properties: { dashboard: pick(DASHBOARDS), ...device } })
      at = minutes(at, between(1, 9))
    }
  }
  if (chance(user.shareAffinity)) {
    events.push({ user, name: 'share_clicked', at, properties: { channel: pick(['link', 'email', 'slack']), ...device } })
  }
}

function buildEvents(users: User[]) {
  const events: Event[] = []
  for (const user of users) {
    const { archetype } = user
    const lastDay = archetype.churnsOn ?? DAYS
    for (let day = user.startDay; day <= lastDay; day++) {
      if (!chance(isWeekend(day) ? archetype.weekend : archetype.weekday)) continue
      const sessions = between(...archetype.sessions)
      for (let i = 0; i < sessions; i++) session(user, day, events)
    }
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime())
}

// Runs after generation on its own random stream, so stories 1 to 3 keep their numbers
// except for the events it removes.
function plantLateStories(events: Event[], users: User[], accounts: Account[]) {
  const late = createRandom(SEED + 1)
  const seatCount = (account: Account) => users.filter((u) => u.account === account).length
  // A few customers wobble, the business doesn't, and the planted pro lift stays clean.
  // One is enterprise, because that is the loss a customer team would drop everything for.
  const candidates = accounts
    .filter((account) => seatCount(account) >= FADING_MIN_SEATS)
    .sort((a, b) => seatCount(a) - seatCount(b))
  const fading = [
    ...candidates.filter((account) => account.plan === 'enterprise').slice(0, 1),
    ...candidates.filter((account) => account.plan === 'free').slice(0, 3),
  ]
  const leaving = new Set(
    users.filter((u) => u.actorType === 'human' && fading.includes(u.account) && late() < FADING_SHARE),
  )
  const dayOf = (at: Date) => Math.round((at.getTime() - dayStart(1).getTime() - 43_200_000) / 86_400_000) + 1

  return events.filter(({ user, name, at }) => {
    const day = dayOf(at)
    if (leaving.has(user) && day >= FADE_FROM_DAY) return false
    const inIncident =
      name === INCIDENT.event && user.platform === INCIDENT.platform && INCIDENT.days.includes(day)
    return !inIncident || late() < INCIDENT.keep
  })
}

async function main() {
  const db = createPool(config.databaseUrl)
  const accounts = buildAccounts()
  const users = buildUsers(accounts)
  const events = plantLateStories(buildEvents(users), users, accounts)

  const seenAt = new Map<number, { first: Date; last: Date }>()
  for (const { user, at } of events) {
    const seen = seenAt.get(user.id)
    if (seen) seen.last = at
    else seenAt.set(user.id, { first: at, last: at })
  }

  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `TRUNCATE recommendations, insights, events, feature_events, features, tracked_users, accounts
       RESTART IDENTITY CASCADE`,
    )
    await client.query(
      `INSERT INTO accounts (id, name, plan)
       SELECT * FROM unnest($1::int[], $2::text[], $3::text[])`,
      [accounts.map((a) => a.id), accounts.map((a) => a.name), accounts.map((a) => a.plan)],
    )
    await client.query(
      `INSERT INTO features (id, key, name)
       SELECT * FROM unnest($1::int[], $2::text[], $3::text[])`,
      [FEATURES.map((f) => f.id), FEATURES.map((f) => f.key), FEATURES.map((f) => f.name)],
    )
    await client.query(
      `INSERT INTO feature_events (event_name, feature_id)
       SELECT * FROM unnest($1::text[], $2::int[])`,
      [Object.keys(FEATURE_EVENTS), Object.values(FEATURE_EVENTS)],
    )
    await client.query(
      `INSERT INTO tracked_users
         (id, external_id, account_id, actor_type, plan, platform, first_seen_at, last_seen_at)
       SELECT * FROM unnest($1::int[], $2::text[], $3::int[], $4::text[], $5::text[], $6::text[],
                            $7::timestamptz[], $8::timestamptz[])`,
      [
        users.map((u) => u.id),
        users.map((u) => u.externalId),
        users.map((u) => u.account.id),
        users.map((u) => u.actorType),
        users.map((u) => u.plan),
        users.map((u) => u.platform),
        users.map((u) => seenAt.get(u.id)?.first ?? null),
        users.map((u) => seenAt.get(u.id)?.last ?? null),
      ],
    )
    for (let i = 0; i < events.length; i += 10_000) {
      const batch = events.slice(i, i + 10_000)
      await client.query(
        `INSERT INTO events
           (user_id, account_id, event_name, feature_id, properties, actor_type, occurred_at)
         SELECT user_id, account_id, event_name, feature_id, properties::jsonb, actor_type, occurred_at
         FROM unnest($1::int[], $2::int[], $3::text[], $4::int[], $5::text[], $6::text[], $7::timestamptz[])
           AS t(user_id, account_id, event_name, feature_id, properties, actor_type, occurred_at)`,
        [
          batch.map((e) => e.user.id),
          batch.map((e) => e.user.account.id),
          batch.map((e) => e.name),
          batch.map((e) => FEATURE_EVENTS[e.name]),
          batch.map((e) => JSON.stringify(e.properties)),
          batch.map((e) => e.user.actorType),
          batch.map((e) => e.at.toISOString()),
        ],
      )
    }
    // Explicit ids above leave the sequences behind.
    for (const table of ['accounts', 'tracked_users', 'features']) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), (SELECT max(id) FROM ${table}))`,
        [table],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  await db.query('ANALYZE')

  const last30 = { from: addDays(demo.dataEnd, -29), to: demo.dataEnd }
  const whole = { from: demo.dataStart, to: demo.dataEnd }
  const [recent, full, humans, everyone] = await Promise.all([
    funnel(db, last30),
    funnel(db, whole),
    activeUsers(db, last30),
    activeUsers(db, { ...last30, includeNonHuman: true }),
  ])

  console.log(`Seeded ${users.length} users, ${accounts.length} accounts, ${events.length} events.`)
  console.log(`Funnel, last 30 days: ${recent.exported}/${recent.opened} (${recent.conversionPct}%)`)
  console.log(`Funnel, all 60 days:  ${full.exported}/${full.opened} (${full.conversionPct}%)`)
  console.log(`DAU on ${demo.dataEnd}: ${humans.dau} humans, ${everyone.dau} with agents and bots`)

  // Dry-run the planted lift so a bad seed fails here, not during the demo.
  const client2 = await db.connect()
  try {
    await client2.query('BEGIN')
    const { rows } = await client2.query<{ id: number }>(
      `INSERT INTO recommendations (feature_id, title, treated_plan, status, shipped_at)
       VALUES (1, 'seed check', 'pro', 'shipped', $1) RETURNING id`,
      [demo.shipDate],
    )
    const result = await measureChange(client2, rows[0]!.id)
    if (result.measurable) {
      console.log(
        `Planted lift on ${demo.shipDate}: treated ${result.treated.before.ratePct}% -> ${result.treated.after.ratePct}%, ` +
          `control ${result.control.before.ratePct}% -> ${result.control.after.ratePct}%, net ${result.liftPts} pts`,
      )
    }
    await client2.query('ROLLBACK')
  } finally {
    client2.release()
  }
  await db.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
