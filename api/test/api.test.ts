import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { db, loadFixtures, readonlyDb } from './fixtures.js'

const app = buildApp({ db, readonlyDb, writeKey: 'test-key' })
const headers = { 'x-write-key': 'test-key' }

const createRecommendation = async () => {
  const insight = await db.query<{ id: number }>(
    `INSERT INTO insights (question, facts, hypotheses, unknowns, queries)
     VALUES ('q', '[]', '[]', '[]', '[]') RETURNING id`,
  )
  const response = await app.inject({
    method: 'POST',
    url: '/api/recommendations',
    payload: { insightId: insight.rows[0]!.id, featureId: 1, title: 'Clearer export action' },
  })
  return response.json<{ id: number; status: string }>()
}

const ship = (id: number) =>
  app.inject({
    method: 'POST',
    url: `/api/recommendations/${id}/ship`,
    payload: { shippedOn: '2026-06-11', treatedPlan: 'pro' },
  })

beforeAll(async () => {
  await app.ready()
})
beforeEach(loadFixtures)
afterAll(async () => {
  await app.close()
  await db.end()
  await readonlyDb.end()
})

describe('approval gate', () => {
  it('refuses to ship an unapproved recommendation', async () => {
    const rec = await createRecommendation()
    expect(rec.status).toBe('draft')

    const refused = await ship(rec.id)
    expect(refused.statusCode).toBe(409)
    expect(refused.json()).toMatchObject({ error: 'not_approved', reason: expect.any(String) })

    const { rows } = await db.query('SELECT status, shipped_at FROM recommendations WHERE id = $1', [rec.id])
    expect(rows[0]).toEqual({ status: 'draft', shipped_at: null })
  })

  it('ships once approved and only once', async () => {
    const rec = await createRecommendation()
    const approved = await app.inject({ method: 'POST', url: `/api/recommendations/${rec.id}/approve` })
    expect(approved.json()).toMatchObject({ status: 'approved', approved_at: expect.anything() })

    const shipped = await ship(rec.id)
    expect(shipped.statusCode).toBe(200)
    expect(shipped.json()).toMatchObject({ status: 'shipped', treated_plan: 'pro' })

    expect((await ship(rec.id)).statusCode).toBe(409)
  })
})

describe('ingestion', () => {
  const post = (url: string, payload: object, h = headers) =>
    app.inject({ method: 'POST', url, payload, headers: h })

  it('needs the write key', async () => {
    const response = await post('/v1/events', { events: [] }, { 'x-write-key': 'wrong' })
    expect(response.statusCode).toBe(401)
  })

  it('rejects an unmapped event with a reason and stores nothing', async () => {
    const before = await db.query('SELECT count(*) FROM events')
    const response = await post('/v1/events', {
      events: [
        { event: 'report_opened', userId: 'u1' },
        { event: 'made_up', userId: 'u1' },
      ],
    })
    expect(response.statusCode).toBe(422)
    expect(response.json().reason).toContain('made_up')
    const after = await db.query('SELECT count(*) FROM events')
    expect(after.rows).toEqual(before.rows)
  })

  it('stores an event with its feature and the actor type from the user', async () => {
    await post('/v1/identify', { userId: 'agent-7', traits: { actorType: 'ai_agent', plan: 'pro' } })
    const response = await post('/v1/events', {
      events: [{ event: 'share_clicked', userId: 'agent-7', properties: { channel: 'link' } }],
    })
    expect(response.statusCode).toBe(202)
    const { rows } = await db.query(
      `SELECT e.actor_type, e.feature_id, e.properties FROM events e
       JOIN tracked_users u ON u.id = e.user_id WHERE u.external_id = 'agent-7'`,
    )
    expect(rows).toEqual([{ actor_type: 'ai_agent', feature_id: 3, properties: { channel: 'link' } }])
  })
})

describe('analytics responses', () => {
  it('include the queries behind them', async () => {
    const response = await app.inject({ url: '/api/features?from=2026-06-01&to=2026-06-30' })
    const body = response.json()
    expect(body.features[0]).toMatchObject({ key: 'reports', adoptionPct: 75 })
    expect(body.queries.length).toBeGreaterThan(0)
    expect(body.queries[0].sql).toContain('WITH segment')
  })

  it.each([
    '/api/priorities?from=2026-06-01&to=2026-06-30',
    '/api/retention',
    '/api/accounts',
    '/api/accounts/1/users',
    '/api/features/1/trend?from=2026-06-01&to=2026-06-30',
  ])('include queries on %s', async (url) => {
    const response = await app.inject({ url })
    expect(response.statusCode).toBe(200)
    expect(response.json().queries.length).toBeGreaterThan(0)
  })

  it('return { error, reason } for an unknown account', async () => {
    const response = await app.inject({ url: '/api/accounts/999/users' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ error: 'not_found' })
  })

  it('return { error, reason } for an unknown route', async () => {
    const response = await app.inject({ url: '/api/nope' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ error: 'not_found', reason: expect.any(String) })
  })

  it('return { error, reason } for a recommendation with no such insight', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/recommendations',
      payload: { insightId: 999, featureId: 1, title: 'Clearer export action' },
    })
    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ error: 'invalid_reference' })
  })

  it('return { error, reason } on bad input', async () => {
    const response = await app.inject({ url: '/api/features?from=nope&to=2026-06-30' })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'invalid_request', reason: expect.any(String) })
  })
})
