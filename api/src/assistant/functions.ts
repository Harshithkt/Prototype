import { z } from 'zod'
import type { Db } from '../db.js'
import { demo } from '../config.js'
import {
  accountHealth,
  activeUsers,
  adoption,
  funnel,
  measureChange,
  retention,
  type QueryRecord,
} from '../metrics.js'
import { priorities } from '../priorities.js'

// The approved functions. Schemas are all the model ever sees: no table
// names and no SQL. The SQL stays on the server and goes back to the dashboard.

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const feature = z.enum(['reports', 'dashboards', 'sharing'])

const definitions = {
  get_active_users: {
    description:
      'The day-by-day series of daily active human users for a date range, with weekly and monthly actives.',
    input: z.object({ from: date, to: date }),
  },
  get_feature_adoption: {
    description:
      'The share of active users who used a feature, with exact user and event counts.',
    input: z.object({ feature, from: date, to: date }),
  },
  get_funnel: {
    description:
      'The Reports funnel: users who opened a report and users who exported one within 7 days.',
    input: z.object({ from: date, to: date }),
  },
  compare_segments: {
    description:
      'Feature adoption split by plan or by platform. It reports who used a feature, not export rates.',
    input: z.object({ feature, from: date, to: date, by: z.enum(['plan', 'platform']) }),
  },
  compare_funnel: {
    description:
      'The Reports funnel split by plan or by platform: how many users in each group opened a report and exported one within 7 days. opened and exported count users, not reports.',
    input: z.object({ from: date, to: date, by: z.enum(['plan', 'platform']) }),
  },
  get_retention: {
    description:
      'Weekly cohort retention across all the data: for each signup week, the share of users still active in later weeks.',
    input: z.object({}),
  },
  get_account_health: {
    description:
      'Customer account health: how many accounts are at risk or worth watching, and which ones, compared week on week.',
    input: z.object({}),
  },
  get_priorities: {
    description:
      'The ranked list of what to fix first in a period: funnel drop-off, adoption gaps, at-risk accounts and unusual usage changes, each with the users affected.',
    input: z.object({ from: date, to: date }),
  },
  measure_change: {
    description:
      'Before and after export completion for a shipped recommendation, against a control group. opened and exported count users, not reports.',
    input: z.object({ recommendation_id: z.number().int().positive() }),
  },
} as const

export type FunctionName = keyof typeof definitions
export const FUNCTION_NAMES = Object.keys(definitions) as FunctionName[]

const dateProperty = { type: 'string', description: 'YYYY-MM-DD, inclusive' }
const featureProperty = { type: 'string', enum: feature.options }

const parameters: Record<FunctionName, object> = {
  get_active_users: {
    type: 'object',
    properties: { from: dateProperty, to: dateProperty },
    required: ['from', 'to'],
  },
  get_feature_adoption: {
    type: 'object',
    properties: { feature: featureProperty, from: dateProperty, to: dateProperty },
    required: ['feature', 'from', 'to'],
  },
  get_funnel: {
    type: 'object',
    properties: { from: dateProperty, to: dateProperty },
    required: ['from', 'to'],
  },
  compare_segments: {
    type: 'object',
    properties: {
      feature: featureProperty,
      from: dateProperty,
      to: dateProperty,
      by: { type: 'string', enum: ['plan', 'platform'] },
    },
    required: ['feature', 'from', 'to', 'by'],
  },
  compare_funnel: {
    type: 'object',
    properties: {
      from: dateProperty,
      to: dateProperty,
      by: { type: 'string', enum: ['plan', 'platform'] },
    },
    required: ['from', 'to', 'by'],
  },
  get_retention: { type: 'object', properties: {} },
  get_account_health: { type: 'object', properties: {} },
  get_priorities: {
    type: 'object',
    properties: { from: dateProperty, to: dateProperty },
    required: ['from', 'to'],
  },
  measure_change: {
    type: 'object',
    properties: { recommendation_id: { type: 'integer' } },
    required: ['recommendation_id'],
  },
}

export const toolSchemas = FUNCTION_NAMES.map((name) => ({
  type: 'function' as const,
  function: { name, description: definitions[name].description, parameters: parameters[name] },
}))

export type LedgerEntry = {
  id: string
  function: FunctionName
  params: Record<string, unknown>
  sql: string
  result: unknown
}

/** Every call made while answering one request, so each fact can cite one. */
export class Ledger {
  entries: LedgerEntry[] = []

  find(id: string) {
    return this.entries.find((entry) => entry.id === id)
  }

  record(name: FunctionName, params: Record<string, unknown>, sql: string, result: unknown) {
    const entry = { id: `q${this.entries.length + 1}`, function: name, params, sql, result }
    this.entries.push(entry)
    return entry
  }

  publicQueries() {
    return this.entries.map(({ id, function: fn, params, sql }) => ({ id, function: fn, params, sql }))
  }
}

const weekdayOf = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })

const joinSql = (queries: QueryRecord[]) => [...new Set(queries.map((q) => q.sql))].join('\n\n')

async function featureId(db: Db, key: string) {
  const { rows } = await db.query<{ id: number }>('SELECT id FROM features WHERE key = $1', [key])
  if (!rows[0]) throw new Error(`Unknown feature ${key}`)
  return rows[0].id
}

async function execute(db: Db, name: FunctionName, rawArgs: unknown) {
  switch (name) {
    case 'get_active_users': {
      const args = definitions.get_active_users.input.parse(rawArgs)
      const { queries, ...totals } = await activeUsers(db, args)
      const series = totals.series.map((point) => ({ ...point, weekday: weekdayOf(point.day) }))
      const dau = series.map((point) => point.dau)
      const avg = dau.length ? Math.round(dau.reduce((a, b) => a + b, 0) / dau.length) : 0
      return {
        args,
        queries,
        result: { ...totals, series, average_dau: avg, peak_dau: Math.max(0, ...dau) },
      }
    }
    case 'get_feature_adoption': {
      const args = definitions.get_feature_adoption.input.parse(rawArgs)
      const { queries, ...result } = await adoption(db, {
        ...args,
        featureId: await featureId(db, args.feature),
      })
      return { args, queries, result }
    }
    case 'get_funnel': {
      const args = definitions.get_funnel.input.parse(rawArgs)
      const { queries, ...result } = await funnel(db, args)
      return { args, queries, result }
    }
    case 'compare_segments': {
      const args = definitions.compare_segments.input.parse(rawArgs)
      const id = await featureId(db, args.feature)
      const values = args.by === 'plan' ? demo.plans : demo.platforms
      const runs = await Promise.all(
        values.map(async (value) => ({
          value,
          ...(await adoption(db, { ...args, featureId: id, [args.by]: value })),
        })),
      )
      return {
        args,
        queries: runs.flatMap((r) => r.queries),
        result: {
          segments: runs.map(({ queries: _queries, value, ...row }) => ({ [args.by]: value, ...row })),
        },
      }
    }
    case 'compare_funnel': {
      const args = definitions.compare_funnel.input.parse(rawArgs)
      const values = args.by === 'plan' ? demo.plans : demo.platforms
      const runs = await Promise.all(
        values.map(async (value) => ({
          value,
          ...(await funnel(db, { ...args, [args.by]: value })),
        })),
      )
      return {
        args,
        queries: runs.flatMap((r) => r.queries),
        result: {
          segments: runs.map(({ queries: _queries, value, ...row }) => ({ [args.by]: value, ...row })),
        },
      }
    }
    case 'get_retention': {
      const args = definitions.get_retention.input.parse(rawArgs)
      const { queries, weeks, cohorts, averages } = await retention(db, {
        from: demo.dataStart,
        to: demo.dataEnd,
      })
      return {
        args,
        queries,
        result: {
          weeks,
          average_retention_by_week: averages,
          cohorts: cohorts.map((c) => ({
            starting: c.start,
            users: c.size,
            retention: c.cells.map((cell) => ({ weeks_later: cell.weeksLater, pct: cell.pct })),
          })),
        },
      }
    }
    case 'get_account_health': {
      const args = definitions.get_account_health.input.parse(rawArgs)
      const { queries, accounts, summary } = await accountHealth(db, { to: demo.dataEnd })
      return {
        args,
        queries,
        result: {
          ...summary,
          total_accounts: accounts.length,
          flagged: accounts
            .filter((a) => a.health !== 'healthy')
            .map(({ name, plan, health, seats, active_now, active_before, lapsed, changePct }) => ({
              name,
              plan,
              health,
              seats,
              active_seats_this_week: active_now,
              active_seats_last_week: active_before,
              lapsed_seats: lapsed,
              change_pct: changePct,
            })),
        },
      }
    }
    case 'get_priorities': {
      const args = definitions.get_priorities.input.parse(rawArgs)
      const { queries, items } = await priorities(db, args)
      return {
        args,
        queries,
        result: {
          priorities: items.map(({ title, detail, usersAffected }) => ({
            title,
            detail,
            users_affected: usersAffected,
          })),
        },
      }
    }
    case 'measure_change': {
      const args = definitions.measure_change.input.parse(rawArgs)
      const { queries, ...result } = await measureChange(db, args.recommendation_id)
      return { args, queries, result }
    }
  }
}

export async function callFunction(db: Db, ledger: Ledger, name: string, rawArgs: unknown) {
  if (!(name in definitions)) throw new Error(`${name} is not an approved function`)
  const fn = name as FunctionName
  const { args, queries, result } = await execute(db, fn, rawArgs)
  return ledger.record(fn, args, joinSql(queries), result)
}
