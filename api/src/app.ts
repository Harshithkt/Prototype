import Fastify, { type FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import { config, demo } from './config.js'
import type { Db } from './db.js'
import type pg from 'pg'
import {
  accountHealth,
  accountUsers,
  activeUsers,
  anomalies,
  dotPlot,
  featureList,
  featureTrend,
  funnel,
  measureChange,
  retention,
  timeline,
} from './metrics.js'
import { priorities } from './priorities.js'
import { answer, type AssistantDeps } from './assistant/index.js'

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
    readonly reason: string,
  ) {
    super(reason)
  }
}

export type AppDeps = {
  /** Writes: ingestion, insights and recommendations. */
  db: pg.Pool
  /** Reads: every metric, through the read-only role. */
  readonlyDb: Db
  llm?: AssistantDeps['llm']
  writeKey?: string
}

const FOREIGN_KEY_VIOLATION = '23503'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)
const rangeQuery = z.object({ from: day, to: day })
const segmentQuery = rangeQuery.extend({
  plan: z.preprocess(emptyToUndefined, z.string().optional()),
  platform: z.preprocess(emptyToUndefined, z.string().optional()),
})
const idParams = z.object({ id: z.coerce.number().int().positive() })

const trackedEvent = z.object({
  event: z.string().min(1),
  userId: z.string().min(1),
  properties: z.record(z.unknown()).default({}),
  timestamp: z.string().datetime({ offset: true }).optional(),
})

const traits = z.object({
  plan: z.string().optional(),
  platform: z.string().optional(),
  actorType: z.enum(['human', 'ai_agent', 'bot', 'service']).optional(),
  accountName: z.string().optional(),
})

export function buildApp({ db, readonlyDb, llm, writeKey = config.writeKey }: AppDeps) {
  const app: FastifyInstance = Fastify({ logger: false })

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.status).send({ error: error.error, reason: error.reason })
    }
    if (error instanceof ZodError) {
      const issue = error.issues[0]
      return reply
        .status(400)
        .send({ error: 'invalid_request', reason: `${issue?.path.join('.')}: ${issue?.message}` })
    }
    if ((error as { code?: string }).code === FOREIGN_KEY_VIOLATION) {
      return reply
        .status(422)
        .send({ error: 'invalid_reference', reason: 'That insight or feature does not exist' })
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ error: 'invalid_request', reason: error.message })
    }
    console.error(error)
    return reply.status(500).send({ error: 'internal_error', reason: 'Something went wrong' })
  })

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({ error: 'not_found', reason: `No route for ${request.url}` }),
  )

  const requireWriteKey = (key: unknown) => {
    if (key !== writeKey) throw new HttpError(401, 'unauthorized', 'Missing or invalid x-write-key')
  }

  app.get('/api/meta', async () => ({
    ...demo,
    synthetic: true,
    assistant: llm ? { mode: 'live', model: llm.model } : { mode: 'scripted' },
  }))

  // Ingestion

  app.post('/v1/events', async (request, reply) => {
    requireWriteKey(request.headers['x-write-key'])
    const { events } = z.object({ events: z.array(trackedEvent).min(1).max(500) }).parse(request.body)

    const names = [...new Set(events.map((e) => e.event))]
    const { rows: mapped } = await db.query<{ event_name: string; feature_id: number }>(
      'SELECT event_name, feature_id FROM feature_events WHERE event_name = ANY($1)',
      [names],
    )
    const featureOf = new Map(mapped.map((m) => [m.event_name, m.feature_id]))
    const unknown = names.filter((name) => !featureOf.has(name))
    if (unknown.length > 0) {
      throw new HttpError(
        422,
        'unknown_event',
        `Not mapped to a feature: ${unknown.join(', ')}. Nothing in this batch was stored.`,
      )
    }

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      for (const event of events) {
        const at = event.timestamp ?? new Date().toISOString()
        // Actor type comes from the user, so queries can filter without a join.
        const { rows } = await client.query<{
          id: number
          account_id: number | null
          actor_type: string
        }>(
          `INSERT INTO tracked_users (external_id, first_seen_at, last_seen_at)
           VALUES ($1, $2, $2)
           ON CONFLICT (external_id) DO UPDATE SET
             first_seen_at = LEAST(tracked_users.first_seen_at, $2),
             last_seen_at = GREATEST(tracked_users.last_seen_at, $2)
           RETURNING id, account_id, actor_type`,
          [event.userId, at],
        )
        const user = rows[0]!
        await client.query(
          `INSERT INTO events
             (user_id, account_id, event_name, feature_id, properties, actor_type, occurred_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            user.id,
            user.account_id,
            event.event,
            featureOf.get(event.event),
            JSON.stringify(event.properties),
            user.actor_type,
            at,
          ],
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return reply.status(202).send({ accepted: events.length })
  })

  app.post('/v1/identify', async (request, reply) => {
    requireWriteKey(request.headers['x-write-key'])
    const body = z.object({ userId: z.string().min(1), traits: traits.default({}) }).parse(request.body)
    const { plan, platform, actorType, accountName } = body.traits

    let accountId: number | null = null
    if (accountName) {
      const { rows: existing } = await db.query<{ id: number }>(
        'SELECT id FROM accounts WHERE name = $1 LIMIT 1',
        [accountName],
      )
      accountId = existing[0]?.id ?? null
      if (!accountId) {
        const { rows } = await db.query<{ id: number }>(
          'INSERT INTO accounts (name, plan) VALUES ($1, $2) RETURNING id',
          [accountName, plan ?? 'free'],
        )
        accountId = rows[0]!.id
      }
    }
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO tracked_users (external_id, account_id, actor_type, plan, platform)
       VALUES ($1, $2, COALESCE($3, 'human'), $4, $5)
       ON CONFLICT (external_id) DO UPDATE SET
         account_id = COALESCE(EXCLUDED.account_id, tracked_users.account_id),
         actor_type = COALESCE($3, tracked_users.actor_type),
         plan = COALESCE(EXCLUDED.plan, tracked_users.plan),
         platform = COALESCE(EXCLUDED.platform, tracked_users.platform)
       RETURNING id`,
      [body.userId, accountId, actorType ?? null, plan ?? null, platform ?? null],
    )
    return reply.status(202).send({ id: rows[0]!.id })
  })

  // Analytics

  app.get('/api/metrics/active-users', async (request) => {
    const query = rangeQuery
      .extend({ includeNonHuman: z.enum(['true', 'false']).default('false') })
      .parse(request.query)
    return activeUsers(readonlyDb, { ...query, includeNonHuman: query.includeNonHuman === 'true' })
  })

  app.get('/api/features', async (request) => {
    const query = segmentQuery.parse(request.query)
    const features = await featureList(readonlyDb, query)
    return { features, queries: features.flatMap((f) => f.queries.slice(0, 1)) }
  })

  app.get('/api/funnels/reports', async (request) =>
    funnel(readonlyDb, segmentQuery.parse(request.query)),
  )

  app.get('/api/features/:id/dotplot', async (request) => {
    const { id } = idParams.parse(request.params)
    const query = segmentQuery
      .extend({ cap: z.coerce.number().int().min(1).max(5000).default(2000) })
      .parse(request.query)
    return dotPlot(readonlyDb, { ...query, featureId: id })
  })

  app.get('/api/features/:id/trend', async (request) => {
    const { id } = idParams.parse(request.params)
    const query = segmentQuery.parse(request.query)
    const [trend, unusual] = await Promise.all([
      featureTrend(readonlyDb, { ...query, featureId: id }),
      anomalies(readonlyDb, query),
    ])
    return {
      series: trend.series,
      anomalies: unusual.anomalies.filter(
        (a) => a.featureId === id && (!query.platform || a.platform === query.platform),
      ),
      queries: [...trend.queries, ...unusual.queries],
    }
  })

  app.get('/api/priorities', async (request) => priorities(readonlyDb, rangeQuery.parse(request.query)))

  app.get('/api/retention', async (request) => {
    const { plan, platform } = segmentQuery.pick({ plan: true, platform: true }).parse(request.query)
    return retention(readonlyDb, { from: demo.dataStart, to: demo.dataEnd, plan, platform })
  })

  app.get('/api/accounts', async (request) => {
    const { plan } = segmentQuery.pick({ plan: true }).parse(request.query)
    return accountHealth(readonlyDb, { to: demo.dataEnd, plan })
  })

  app.get('/api/accounts/:id/users', async (request) => {
    const { id } = idParams.parse(request.params)
    const result = await accountUsers(readonlyDb, { accountId: id, to: demo.dataEnd })
    if (!result.account) throw new HttpError(404, 'not_found', 'No such account')
    return result
  })

  app.get('/api/users/:id/timeline', async (request) => {
    const { id } = idParams.parse(request.params)
    const result = await timeline(readonlyDb, id)
    if (!result.user) throw new HttpError(404, 'not_found', 'No such user')
    return result
  })

  // Assistant

  app.post('/api/assistant/ask', async (request) => {
    const { question } = z.object({ question: z.string().trim().min(3).max(500) }).parse(request.body)
    const result = await answer({ db: readonlyDb, llm }, question)
    if (!result.ok) throw new HttpError(result.status, result.error, result.reason)
    const { card, mode, model, notice } = result
    const { rows } = await db.query<{ id: number; created_at: string }>(
      `INSERT INTO insights (question, facts, hypotheses, unknowns, queries)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [
        question,
        JSON.stringify(card.facts),
        JSON.stringify(card.hypotheses),
        JSON.stringify(card.unknowns),
        JSON.stringify(card.queries),
      ],
    )
    return { ...card, ...rows[0], question, mode, model, notice }
  })

  // Recommendations

  const RECOMMENDATION_COLUMNS = `
    r.id, r.insight_id, r.feature_id, r.title, r.detail, r.treated_plan, r.status,
    r.approved_at, r.shipped_at, f.name AS feature_name, i.question`

  const getRecommendation = async (id: number) => {
    const { rows } = await db.query(
      `SELECT ${RECOMMENDATION_COLUMNS}
       FROM recommendations r
       LEFT JOIN features f ON f.id = r.feature_id
       LEFT JOIN insights i ON i.id = r.insight_id
       WHERE r.id = $1`,
      [id],
    )
    if (!rows[0]) throw new HttpError(404, 'not_found', 'No such recommendation')
    return rows[0]
  }

  app.get('/api/recommendations', async () => {
    const { rows } = await db.query(
      `SELECT ${RECOMMENDATION_COLUMNS}
       FROM recommendations r
       LEFT JOIN features f ON f.id = r.feature_id
       LEFT JOIN insights i ON i.id = r.insight_id
       ORDER BY r.id DESC`,
    )
    return { recommendations: rows }
  })

  app.post('/api/recommendations', async (request, reply) => {
    const body = z
      .object({
        insightId: z.number().int().positive(),
        featureId: z.number().int().positive(),
        title: z.string().trim().min(3).max(200),
        detail: z.string().trim().max(2000).optional(),
      })
      .parse(request.body)
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO recommendations (insight_id, feature_id, title, detail)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [body.insightId, body.featureId, body.title, body.detail ?? null],
    )
    return reply.status(201).send(await getRecommendation(rows[0]!.id))
  })

  app.post('/api/recommendations/:id/approve', async (request) => {
    const { id } = idParams.parse(request.params)
    const { rowCount } = await db.query(
      `UPDATE recommendations SET status = 'approved', approved_at = now()
       WHERE id = $1 AND status = 'draft'`,
      [id],
    )
    if (!rowCount) {
      await getRecommendation(id)
      throw new HttpError(409, 'not_draft', 'Only a draft can be approved')
    }
    return getRecommendation(id)
  })

  app.post('/api/recommendations/:id/ship', async (request) => {
    const { id } = idParams.parse(request.params)
    const { shippedOn, treatedPlan } = z
      .object({ shippedOn: day, treatedPlan: z.enum(demo.plans as [string, ...string[]]) })
      .parse(request.body)
    // The status check lives in the UPDATE so the gate cannot be raced.
    const { rowCount } = await db.query(
      `UPDATE recommendations
       SET status = 'shipped', shipped_at = $2::date, treated_plan = $3
       WHERE id = $1 AND status = 'approved'`,
      [id, shippedOn, treatedPlan],
    )
    if (!rowCount) {
      await getRecommendation(id)
      throw new HttpError(409, 'not_approved', 'A recommendation must be approved before it ships')
    }
    return getRecommendation(id)
  })

  app.get('/api/recommendations/:id/measurement', async (request) => {
    const { id } = idParams.parse(request.params)
    await getRecommendation(id)
    return measureChange(readonlyDb, id)
  })

  return app
}
