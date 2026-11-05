import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  accountHealth,
  accountUsers,
  activeUsers,
  adoption,
  classifyAccount,
  confidence,
  detectAnomalies,
  dotPlot,
  funnel,
  measureChange,
  retention,
  timeline,
} from '../src/metrics.js'
import { db, DASHBOARDS, loadFixtures, readonlyDb, REPORTS } from './fixtures.js'

const JUNE = { from: '2026-06-01', to: '2026-06-30' }

beforeAll(loadFixtures)
afterAll(async () => {
  await db.end()
  await readonlyDb.end()
})

describe('active users', () => {
  it('counts humans with a qualifying event per day', async () => {
    const result = await activeUsers(readonlyDb, { from: '2026-06-01', to: '2026-06-02' })
    expect(result.series).toEqual([
      { day: '2026-06-01', dau: 3 }, // users 1, 2, 5
      { day: '2026-06-02', dau: 2 }, // users 3, 5; user 4's event is not qualifying
    ])
  })

  it('adds non-humans only when asked', async () => {
    const result = await activeUsers(readonlyDb, {
      from: '2026-06-01',
      to: '2026-06-01',
      includeNonHuman: true,
    })
    expect(result.series).toEqual([{ day: '2026-06-01', dau: 4 }])
  })

  it('uses 7 and 30 day windows ending on the chosen date', async () => {
    const result = await activeUsers(readonlyDb, { from: '2026-06-01', to: '2026-06-07' })
    expect(result.wau).toBe(4) // users 1, 2, 3, 5
    expect(result.mau).toBe(4)
    const later = await activeUsers(readonlyDb, { from: '2026-06-01', to: '2026-06-09' })
    expect(later.wau).toBe(3) // Jun 3 to 9: users 1, 2, 3
  })

  it('returns the SQL and parameters behind each number', async () => {
    const result = await activeUsers(readonlyDb, JUNE)
    expect(result.queries.map((q) => q.name)).toEqual(['DAU', 'WAU', 'MAU'])
    expect(result.queries[0]?.sql).toContain('fe.qualifying')
    expect(result.queries[0]?.params).toEqual(['2026-06-01', '2026-07-01', false])
  })
})

describe('feature adoption', () => {
  it('reports the share of active users with exact counts', async () => {
    const result = await adoption(readonlyDb, { ...JUNE, featureId: REPORTS })
    expect(result).toMatchObject({ usersUsed: 3, usersActive: 4, adoptionPct: 75, frequency: 9 })
  })

  it('narrows to a plan or platform', async () => {
    const pro = await adoption(readonlyDb, { ...JUNE, featureId: REPORTS, plan: 'pro' })
    expect(pro).toMatchObject({ usersUsed: 1, usersActive: 2, adoptionPct: 50 })
    const mobile = await adoption(readonlyDb, { ...JUNE, featureId: DASHBOARDS, platform: 'mobile' })
    expect(mobile).toMatchObject({ usersUsed: 0, usersActive: 1, adoptionPct: 0 })
  })

  it('handles an empty range', async () => {
    const result = await adoption(readonlyDb, { from: '2020-01-01', to: '2020-01-02', featureId: REPORTS })
    expect(result).toMatchObject({ usersUsed: 0, usersActive: 0, adoptionPct: null })
  })
})

describe('funnel', () => {
  it('counts an export only inside 7 days of the first open', async () => {
    const result = await funnel(readonlyDb, { from: '2026-06-01', to: '2026-06-07' })
    // User 2's export lands exactly at t1 + 7 days, which the window excludes.
    expect(result).toMatchObject({ opened: 3, exported: 1, conversionPct: 33.3 })
  })
})

describe('dot plot and timeline', () => {
  it('gives one dot per user, with zero for use on the last day', async () => {
    const result = await dotPlot(readonlyDb, {
      from: '2026-06-01',
      to: '2026-06-22',
      featureId: REPORTS,
      cap: 100,
    })
    expect(result.total).toBe(3)
    const dot = result.dots.find((d) => d.external_id === 'u2')
    expect(dot).toMatchObject({ interactions: 4, days_since_last_use: 0 })
    const lapsed = result.dots.find((d) => d.external_id === 'u5')
    expect(lapsed).toMatchObject({ interactions: 2, days_since_last_use: 20 })
  })

  it('caps the dots but keeps the exact total', async () => {
    const result = await dotPlot(readonlyDb, { ...JUNE, featureId: REPORTS, cap: 1 })
    expect(result.dots).toHaveLength(1)
    expect(result.total).toBe(3)
  })

  it('filters by plan', async () => {
    const result = await dotPlot(readonlyDb, { ...JUNE, featureId: REPORTS, plan: 'enterprise', cap: 10 })
    expect(result.dots.map((d) => d.external_id)).toEqual(['u5'])
  })

  it('lists a user newest first', async () => {
    const { events, user } = await timeline(readonlyDb, 1)
    expect(user).toMatchObject({ external_id: 'u1', plan: 'free' })
    expect(events.map((e) => e.event_name)).toEqual(['report_opened', 'report_exported', 'report_opened'])
  })
})

describe('before and after', () => {
  it('reports treated change minus control change', async () => {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO recommendations (feature_id, title, treated_plan, status, shipped_at)
       VALUES (1, 'Fixture', 'pro', 'shipped', '2026-06-21') RETURNING id`,
    )
    const result = await measureChange(readonlyDb, rows[0]!.id)
    if (!result.measurable) throw new Error(result.reason)
    // Data runs Jun 1 to Jun 22, so the after window limits both sides to 2 days.
    expect(result.windowDays).toBe(2)

    const wide = await db.query<{ id: number }>(
      `INSERT INTO recommendations (feature_id, title, treated_plan, status, shipped_at)
       VALUES (1, 'Fixture', 'pro', 'shipped', '2026-06-11') RETURNING id`,
    )
    const measured = await measureChange(readonlyDb, wide.rows[0]!.id)
    if (!measured.measurable) throw new Error(measured.reason)
    expect(measured.windowDays).toBe(10)
    // Before (Jun 1-10): pro user 2 opened, export missed the window. Control: user 1
    // exported, user 5 did not. After (Jun 11-20): nobody opened.
    expect(measured.treated.before).toEqual({ opened: 1, exported: 0, ratePct: 0 })
    expect(measured.control.before).toEqual({ opened: 2, exported: 1, ratePct: 50 })
    expect(measured.liftPts).toBeNull()
    expect(measured.caveat).toMatch(/not proof of cause/)
  })

  it('computes a lift when both windows have opens', async () => {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO recommendations (feature_id, title, treated_plan, status, shipped_at)
       VALUES (1, 'Fixture', 'pro', 'shipped', '2026-06-13') RETURNING id`,
    )
    const result = await measureChange(readonlyDb, rows[0]!.id)
    if (!result.measurable) throw new Error(result.reason)
    expect(result.windowDays).toBe(10)
    // After is Jun 13 to 22: users 1 and 2 return on Jun 22 and only user 2 exports.
    expect(result.treated.after.opened).toBe(1)
    expect(result.treated.after.ratePct).toBe(100)
    expect(result.control.after).toEqual({ opened: 1, exported: 0, ratePct: 0 })
  })

  it('will not measure an unshipped recommendation', async () => {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO recommendations (feature_id, title) VALUES (1, 'Draft') RETURNING id`,
    )
    const result = await measureChange(readonlyDb, rows[0]!.id)
    expect(result.measurable).toBe(false)
  })
})

describe('read-only role', () => {
  it('cannot write', async () => {
    await expect(readonlyDb.query(`DELETE FROM events`)).rejects.toThrow(/permission denied|read-only/)
  })
})

describe('unusual changes', () => {
  const week = (day: string, users: number, platform = 'mobile') => ({
    day,
    feature_id: 2,
    feature: 'Dashboards',
    platform,
    users,
  })
  // Tuesdays and Wednesdays, four weeks of 40 users, then a two-day collapse.
  const rows = [
    ...['2026-05-05', '2026-05-12', '2026-05-19', '2026-05-26'].map((d) => week(d, 40)),
    ...['2026-05-06', '2026-05-13', '2026-05-20', '2026-05-27'].map((d) => week(d, 40)),
    week('2026-06-02', 8),
    week('2026-06-03', 12),
  ]
  const range = { from: '2026-06-01', to: '2026-06-30' }

  it('merges neighbouring days into one incident at its worst', () => {
    expect(detectAnomalies(rows, range)).toEqual([
      expect.objectContaining({
        direction: 'drop',
        from: '2026-06-02',
        to: '2026-06-03',
        users: 8,
        baseline: 40,
        changePct: -80,
      }),
    ])
  })

  it('compares like with like, so a quiet weekend is not an incident', () => {
    const weekends = ['2026-05-09', '2026-05-16', '2026-05-23', '2026-05-30', '2026-06-06'].map((d) => week(d, 20))
    expect(detectAnomalies(weekends, range)).toEqual([])
  })

  it('ignores groups too small to judge', () => {
    const tiny = ['2026-05-12', '2026-05-19', '2026-05-26'].map((d) => week(d, 6))
    expect(detectAnomalies([...tiny, week('2026-06-02', 1)], range)).toEqual([])
  })

  it('needs at least two earlier weeks', () => {
    expect(detectAnomalies([week('2026-05-26', 40), week('2026-06-02', 5)], range)).toEqual([])
  })
})

describe('retention', () => {
  it('counts each cohort by the week of its first activity', async () => {
    const result = await retention(readonlyDb, { from: '2026-06-01', to: '2026-06-28' })
    expect(result.weeks).toBe(4)
    const [first] = result.cohorts
    // Users 1, 2, 3 and 5 start in week 0. User 3 returns on Jun 5 (still week 0).
    expect(first).toMatchObject({ start: '2026-06-01', size: 4 })
    // Week 1 (Jun 8-14) has user 2's export. Week 3 (Jun 22-28) has users 1 and 2.
    expect(first?.cells).toEqual([
      { weeksLater: 0, users: 4, pct: 100 },
      { weeksLater: 1, users: 1, pct: 25 },
      { weeksLater: 3, users: 2, pct: 50 },
    ])
  })

  it('leaves out a week that has not finished', async () => {
    const result = await retention(readonlyDb, { from: '2026-06-01', to: '2026-06-24' })
    expect(result.weeks).toBe(3)
    expect(result.cohorts[0]?.cells.map((c) => c.weeksLater)).toEqual([0, 1])
  })

  it('narrows to a plan', async () => {
    const result = await retention(readonlyDb, { from: '2026-06-01', to: '2026-06-28', plan: 'enterprise' })
    expect(result.cohorts[0]).toMatchObject({ size: 1 })
  })
})

describe('account health', () => {
  it('needs both a large share and enough seats to call an account at risk', () => {
    expect(classifyAccount({ active_now: 10, active_before: 20 })).toEqual({ health: 'at_risk', changePct: -50 })
    expect(classifyAccount({ active_now: 1, active_before: 3 }).health).toBe('healthy') // Too few seats.
    expect(classifyAccount({ active_now: 14, active_before: 20 }).health).toBe('watch')
    expect(classifyAccount({ active_now: 19, active_before: 20 }).health).toBe('healthy')
    expect(classifyAccount({ active_now: 5, active_before: 0 })).toEqual({ health: 'healthy', changePct: null })
  })

  it('compares the last 7 days with the 7 before', async () => {
    const result = await accountHealth(readonlyDb, { to: '2026-06-08' })
    // Jun 2-8: users 1, 2, 3 and 5. May 26-Jun 1: users 1, 2 and 5. User 4 has only a
    // non-qualifying event, so counts as a lapsed seat. The bot takes no seat.
    expect(result.accounts).toEqual([
      expect.objectContaining({
        seats: 5,
        active_now: 4,
        active_before: 3,
        lapsed: 1,
        health: 'healthy',
        changePct: 33,
      }),
    ])
  })

  it('lists the people in an account, quietest first', async () => {
    const result = await accountUsers(readonlyDb, { accountId: 1, to: '2026-06-22' })
    expect(result.account).toMatchObject({ name: 'Acme Fixture' })
    expect(result.users.map((u) => u.external_id)).toEqual(['u4', 'u5', 'u3', 'u1', 'u2'])
  })
})

describe('confidence on the result', () => {
  const cells = (a: number, b: number, c: number, d: number) => [
    { opened: 352, exported: a },
    { opened: 353, exported: b },
    { opened: 342, exported: c },
    { opened: 338, exported: d },
  ]

  it('gives a 95% range and calls a clear positive', () => {
    // Variance sums to 0.00137, so the margin is 1.96 x 3.71 pts = 7.3 pts.
    expect(confidence(cells(33, 98, 37, 36), 18.5)).toEqual({ low: 11.2, high: 25.8, verdict: 'positive' })
  })

  it('will not call a result whose range crosses zero', () => {
    expect(confidence(cells(33, 38, 37, 36), 1.5)?.verdict).toBe('unclear')
  })

  it('calls a clear negative', () => {
    expect(confidence(cells(98, 33, 37, 36), -18.5)?.verdict).toBe('negative')
  })

  it('has nothing to say without opens in a window', async () => {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO recommendations (feature_id, title, treated_plan, status, shipped_at)
       VALUES (1, 'Fixture', 'pro', 'shipped', '2026-06-13') RETURNING id`,
    )
    const result = await measureChange(readonlyDb, rows[0]!.id)
    if (!result.measurable) throw new Error(result.reason)
    expect(result.confidence).toBeNull() // Nobody opened a report in the before window.
  })
})
