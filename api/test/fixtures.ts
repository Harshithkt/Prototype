import { config } from '../src/config.js'
import { createPool } from '../src/db.js'

const testUrl = (base: string) => {
  const url = new URL(base)
  url.pathname = '/analytics_test'
  return url.toString()
}

export const db = createPool(testUrl(config.databaseUrl))
export const readonlyDb = createPool(testUrl(config.readonlyDatabaseUrl))

export const REPORTS = 1
export const DASHBOARDS = 2

type Row = [user: number, event: string, at: string]

// A small world with hand-countable answers. Users 1-5 are human, 6 is a bot.
const EVENTS: Row[] = [
  // User 1: free. Opens on Jun 1, exports 2 days later.
  [1, 'report_opened', '2026-06-01T10:00:00Z'],
  [1, 'report_exported', '2026-06-03T10:00:00Z'],
  // User 2: pro. Opens on Jun 1, exports 7 days later, just outside the window.
  [2, 'report_opened', '2026-06-01T10:00:00Z'],
  [2, 'report_exported', '2026-06-08T10:00:00Z'],
  // User 3: pro. Dashboards only.
  [3, 'dashboard_viewed', '2026-06-02T09:00:00Z'],
  [3, 'dashboard_viewed', '2026-06-05T09:00:00Z'],
  // User 4: pro. Only a non-qualifying event, so never active.
  [4, 'settings_opened', '2026-06-02T09:00:00Z'],
  // User 5: enterprise, mobile. Used Reports, then lapsed.
  [5, 'report_opened', '2026-06-01T12:00:00Z'],
  [5, 'report_opened', '2026-06-02T12:00:00Z'],
  // User 6: bot.
  [6, 'report_opened', '2026-06-01T01:00:00Z'],
  [6, 'dashboard_viewed', '2026-06-10T01:00:00Z'],
  // Later window for before/after: user 1 and 2 return after the Jun 21 ship date.
  [2, 'report_opened', '2026-06-22T10:00:00Z'],
  [2, 'report_exported', '2026-06-22T11:00:00Z'],
  [1, 'report_opened', '2026-06-22T10:00:00Z'],
]

export async function loadFixtures() {
  await db.query(
    `TRUNCATE recommendations, insights, events, feature_events, features, tracked_users, accounts
     RESTART IDENTITY CASCADE`,
  )
  await db.query(`INSERT INTO features (key, name) VALUES ('reports', 'Reports'), ('dashboards', 'Dashboards'), ('sharing', 'Sharing')`)
  await db.query(`
    INSERT INTO feature_events (event_name, feature_id, qualifying) VALUES
      ('report_opened', 1, true), ('report_exported', 1, true),
      ('dashboard_viewed', 2, true), ('share_clicked', 3, true),
      ('settings_opened', 2, false)`)
  await db.query(`INSERT INTO accounts (name, plan) VALUES ('Acme Fixture', 'pro')`)
  await db.query(`
    INSERT INTO tracked_users (external_id, account_id, actor_type, plan, platform) VALUES
      ('u1', 1, 'human', 'free', 'web'),
      ('u2', 1, 'human', 'pro', 'web'),
      ('u3', 1, 'human', 'pro', 'web'),
      ('u4', 1, 'human', 'pro', 'web'),
      ('u5', 1, 'human', 'enterprise', 'mobile'),
      ('b1', 1, 'bot', 'pro', 'web')`)
  for (const [user, event, at] of EVENTS) {
    await db.query(
      `INSERT INTO events (user_id, account_id, event_name, feature_id, actor_type, occurred_at)
       SELECT $1, 1, $2, fe.feature_id, u.actor_type, $3
       FROM feature_events fe, tracked_users u
       WHERE fe.event_name = $2 AND u.id = $1`,
      [user, event, at],
    )
  }
}
