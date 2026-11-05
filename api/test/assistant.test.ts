import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { answer, type LlmConfig } from '../src/assistant/index.js'
import { callFunction, Ledger, toolSchemas } from '../src/assistant/functions.js'
import { verifyInsight } from '../src/assistant/guardrails.js'
import { db, loadFixtures, readonlyDb } from './fixtures.js'

// A stand-in for the Nebius endpoint: replays scripted replies and records requests.
let replies: object[] = []
let requests: { messages: { role: string; content: string | null }[]; tools: unknown }[] = []
let server: Server
let llm: LlmConfig

const toolCall = (name: string, args: object, id = 'call_1') => ({
  tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
})

beforeAll(async () => {
  await loadFixtures()
  server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      requests.push(JSON.parse(body))
      const message = replies.shift()
      response.writeHead(message ? 200 : 500, { 'content-type': 'application/json' })
      response.end(JSON.stringify(message ? { choices: [{ message }] } : { error: 'no reply' }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  llm = { apiKey: 'test', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'test-model' }
})
beforeEach(() => {
  replies = []
  requests = []
})
afterAll(async () => {
  server.close()
  await db.end()
  await readonlyDb.end()
})

const JUNE = { from: '2026-06-01', to: '2026-06-30' }
const hypotheses = [{ text: 'The button is hidden.', evidence_needed: 'Click paths' }]
const unknowns = [{ text: 'Whether exports failed.' }]

describe('live model', () => {
  it('runs a tool call and returns a cited card', async () => {
    replies = [
      toolCall('get_funnel', JUNE),
      {
        content: JSON.stringify({
          facts: [{ text: '1 of 3 users exported within 7 days (33.3%).', query_id: 'q1' }],
          hypotheses,
          unknowns,
        }),
      },
    ]
    const result = await answer({ db: readonlyDb, llm }, "Why aren't users exporting reports?")
    if (!result.ok) throw new Error(result.reason)
    expect(result.mode).toBe('live')
    expect(result.card.facts).toHaveLength(1)
    expect(result.card.queries[0]).toMatchObject({ id: 'q1', function: 'get_funnel' })
    expect(result.card.queries[0]?.sql).toContain('report_exported')
  })

  it('removes query ids the model left in a fact', async () => {
    replies = [
      toolCall('get_funnel', JUNE),
      {
        content: JSON.stringify({
          facts: [{ text: '1 of 3 users exported (q1).', query_id: 'q1' }],
          hypotheses,
          unknowns,
        }),
      },
    ]
    const result = await answer({ db: readonlyDb, llm }, 'How are exports?')
    if (!result.ok) throw new Error(result.reason)
    expect(result.card.facts[0]).toEqual({ text: '1 of 3 users exported.', query_id: 'q1' })
  })

  it('never shows the model table names or SQL', async () => {
    replies = [toolCall('get_funnel', JUNE), { content: 'not json' }, { content: 'not json' }, { content: 'not json' }]
    await answer({ db: readonlyDb, llm }, "Why aren't users exporting reports?")
    const everything = JSON.stringify(requests)
    expect(everything).not.toMatch(/tracked_users|feature_events|SELECT |FROM events/)
  })

  it('sends an uncited number back, then accepts the corrected answer', async () => {
    replies = [
      toolCall('get_funnel', JUNE),
      {
        content: JSON.stringify({
          facts: [{ text: '42 users exported.', query_id: 'q1' }],
          hypotheses,
          unknowns,
        }),
      },
      {
        content: JSON.stringify({
          facts: [{ text: '1 user exported.', query_id: 'q1' }],
          hypotheses,
          unknowns,
        }),
      },
    ]
    const result = await answer({ db: readonlyDb, llm }, 'How are exports?')
    if (!result.ok) throw new Error(result.reason)
    expect(result.card.facts[0]?.text).toBe('1 user exported.')
    expect(requests.at(-1)?.messages.at(-1)?.content).toContain('42')
  })

  it('refuses SQL-shaped and unapproved calls', async () => {
    replies = [
      toolCall('run_sql', { query: 'DELETE FROM events' }),
      {
        content: JSON.stringify({ facts: [{ text: 'Nothing.', query_id: 'q1' }], hypotheses, unknowns }),
      },
    ]
    await answer({ db: readonlyDb, llm }, 'How are exports?')
    const toolMessage = requests[1]?.messages.find((m) => m.role === 'tool')
    expect(toolMessage?.content).toContain('not an approved function')
  })

  it('offers only the approved functions', async () => {
    expect(toolSchemas.map((t) => t.function.name)).toEqual([
      'get_active_users',
      'get_feature_adoption',
      'get_funnel',
      'compare_segments',
      'compare_funnel',
      'get_retention',
      'get_account_health',
      'get_priorities',
      'measure_change',
    ])
  })

  it('tells the model which recommendations shipped, so it can measure one', async () => {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO recommendations (feature_id, title, treated_plan, status, shipped_at)
       VALUES (1, 'Clearer export', 'pro', 'shipped', '2026-06-11') RETURNING id`,
    )
    const id = rows[0]!.id
    replies = [
      toolCall('measure_change', { recommendation_id: id }),
      {
        content: JSON.stringify({
          facts: [{ text: 'Control went from 50% before.', query_id: 'q1' }],
          hypotheses,
          unknowns,
        }),
      },
    ]
    const result = await answer({ db: readonlyDb, llm }, 'Did the clearer export work?')
    if (!result.ok) throw new Error(result.reason)
    expect(result.card.queries[0]).toMatchObject({ function: 'measure_change' })
    expect(requests[0]?.messages[0]?.content).toContain(`recommendation_id ${id}: "Clearer export"`)
    await db.query('DELETE FROM recommendations WHERE id = $1', [id])
  })

  it('declines an off-topic question politely', async () => {
    replies = [{ content: 'DECLINED' }]
    const result = await answer({ db: readonlyDb, llm }, 'Write me a poem about cats')
    expect(result).toMatchObject({ ok: false, status: 422, error: 'off_topic' })
  })

  it('falls back to the scripted card on the demo question when the model fails', async () => {
    const result = await answer({ db: readonlyDb, llm }, "Why aren't users exporting reports?")
    if (!result.ok) throw new Error(result.reason)
    expect(result.mode).toBe('scripted')
    expect(result.notice).toBeTruthy()
  })

  it('shows nothing for other questions when no verified answer exists', async () => {
    const result = await answer({ db: readonlyDb, llm }, 'What is our DAU?')
    expect(result).toMatchObject({ ok: false, status: 502 })
  })
})

describe('without a key', () => {
  it('builds the demo card from the same functions', async () => {
    const result = await answer({ db: readonlyDb }, "Why aren't users exporting reports?")
    if (!result.ok) throw new Error(result.reason)
    expect(result.mode).toBe('scripted')
    expect(result.card.queries.map((q) => q.function)).toEqual([
      'get_funnel',
      'get_feature_adoption',
      'compare_funnel',
    ])
    const queryIds = new Set(result.card.queries.map((q) => q.id))
    for (const fact of result.card.facts) expect(queryIds.has(fact.query_id)).toBe(true)
    for (const hypothesis of result.card.hypotheses) expect(hypothesis.evidence_needed).toBeTruthy()
  })

  it('builds the weekly brief from the same functions', async () => {
    const result = await answer({ db: readonlyDb }, "Give me this week's brief")
    if (!result.ok) throw new Error(result.reason)
    expect(result.card.queries.map((q) => q.function)).toEqual(['get_active_users', 'get_priorities'])
    expect(result.card.facts.length).toBeGreaterThan(0)
  })

  it('says so for any other question', async () => {
    const result = await answer({ db: readonlyDb }, 'What is our DAU?')
    expect(result).toMatchObject({ ok: false, status: 422 })
  })
})

describe('guardrails', () => {
  const ledgerWithFunnel = async () => {
    const ledger = new Ledger()
    await callFunction(readonlyDb, ledger, 'get_funnel', JUNE)
    return ledger
  }
  const card = (facts: { text: string; query_id: string }[]) => ({ facts, hypotheses, unknowns })

  it('rejects a fact citing a query from outside the request', async () => {
    const problems = verifyInsight(card([{ text: 'Exports are low.', query_id: 'q9' }]), await ledgerWithFunnel())
    expect(problems[0]).toContain('q9')
  })

  it('rejects causal language in a fact', async () => {
    const problems = verifyInsight(
      card([{ text: 'Exports are low because the button is hidden.', query_id: 'q1' }]),
      await ledgerWithFunnel(),
    )
    expect(problems[0]).toContain('causal')
  })

  it('rejects an invented number in a hypothesis', async () => {
    const problems = verifyInsight(
      { facts: [{ text: 'Exports are low.', query_id: 'q1' }], unknowns: [], hypotheses: [{ text: '88 percent never saw it.', evidence_needed: 'Clicks' }] },
      await ledgerWithFunnel(),
    )
    expect(problems[0]).toContain('88')
  })

  it('rejects internal function names in reader-facing text', async () => {
    const problems = verifyInsight(
      {
        facts: [{ text: 'Exports are low.', query_id: 'q1' }],
        unknowns: [],
        hypotheses: [{ text: 'Plans may differ.', evidence_needed: 'Run compare_segments by plan' }],
      },
      await ledgerWithFunnel(),
    )
    expect(problems[0]).toContain('compare_segments')
  })

  it('accepts a number that a function returned inside its own text', async () => {
    const ledger = new Ledger()
    ledger.record('get_priorities', {}, '', { priorities: [{ title: 'Dashboards fell 71%' }] })
    expect(verifyInsight(card([{ text: 'Dashboards fell 71%.', query_id: 'q1' }]), ledger)).toEqual([])
    expect(verifyInsight(card([{ text: 'Dashboards fell 72%.', query_id: 'q1' }]), ledger)).toHaveLength(1)
  })

  it('accepts a negative result written without its sign', async () => {
    const ledger = new Ledger()
    ledger.record('measure_change', {}, '', { changePts: -0.1 })
    const problems = verifyInsight(card([{ text: 'Control moved −0.1 pts.', query_id: 'q1' }]), ledger)
    expect(problems).toEqual([])
  })

  it('gives the model the daily series, so trend questions can be answered', async () => {
    const ledger = new Ledger()
    const entry = await callFunction(readonlyDb, ledger, 'get_active_users', {
      from: '2026-06-01',
      to: '2026-06-02',
    })
    expect(entry.result).toMatchObject({
      series: [
        { day: '2026-06-01', dau: 3 },
        { day: '2026-06-02', dau: 2 },
      ],
    })
  })

  it('accepts rounded forms of a returned number, and dates', async () => {
    const problems = verifyInsight(
      card([{ text: 'From 2026-06-01, about 33% of 3 users exported within 7 days.', query_id: 'q1' }]),
      await ledgerWithFunnel(),
    )
    expect(problems).toEqual([])
  })
})
