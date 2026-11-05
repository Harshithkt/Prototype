import type { Db } from '../db.js'
import { demo } from '../config.js'
import { shippedRecommendations } from '../metrics.js'
import { callFunction, Ledger, toolSchemas } from './functions.js'
import { insightSchema, verifyInsight, type InsightDraft } from './guardrails.js'
import { defaultRange, isBriefQuestion, isDemoQuestion, scriptedBrief, scriptedInsight } from './scripted.js'

export type LlmConfig = { apiKey: string; baseUrl: string; model: string }
export type AssistantDeps = { db: Db; llm?: LlmConfig }

const MAX_STEPS = 8
const MAX_CORRECTIONS = 2
const TIMEOUT_MS = 45_000

class Declined extends Error {}

type ToolCall = { id: string; function: { name: string; arguments: string } }
type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

async function systemPrompt(db: Db) {
  const { from, to } = defaultRange()
  const shipped = await shippedRecommendations(db)
  const shippedList = shipped.length
    ? shipped
        .map((r) => `- recommendation_id ${r.id}: "${r.title}", shipped ${r.shipped_on} to the ${r.treated_plan} plan`)
        .join('\n')
    : '- None yet.'
  return `You are the analytics assistant for a B2B SaaS product team. Answer in plain language for a Head of Product.

Data covers ${demo.dataStart} to ${demo.dataEnd}. Treat ${demo.dataEnd} as today. Unless the question names a period, use ${from} to ${to}.
Features: reports, dashboards, sharing. Plans: ${demo.plans.join(', ')}. Platforms: ${demo.platforms.join(', ')}.

Shipped recommendations:
${shippedList}

Rules:
- Get every number by calling the functions. Each function result has a query_id.
- For a "why" question, gather the evidence first: call every function that bears on it before you answer. If a function can check an idea, call it instead of listing the idea as a hypothesis.
- A question about report exports needs get_funnel and compare_funnel by plan.
- A question about a drop, an incident or something unusual needs get_priorities first, for the period around the date asked about.
- If the question is whether a shipped change worked, or what happened after a release, call measure_change for that recommendation and report the treated change, the control change and the net change. This is an observational comparison, so never say the change caused the result. If no shipped recommendation matches, report the current funnel and say under unknowns that the change has not shipped.
- A fact is something a function returned. Each fact cites the query_id it came from and only quotes numbers exactly as that result gives them. Do not calculate new numbers.
- A fact never says why something happened. Possible causes go in hypotheses.
- evidence_needed names data the team would have to collect, such as click paths or a survey. It is never something a function can already return.
- Unknowns are what the available data cannot tell us.
- Give at most 3 hypotheses and 2 unknowns, the ones that matter most.
- For a brief or summary, call get_priorities and get_active_users, then lead with what matters most. A brief is for a busy founder: at most 4 facts, no hypotheses and 1 unknown.
- The suggestion is a change to the product. Never aim it at one plan or platform, because the rollout group is chosen later.
- Never mention function names or query ids in any text. Readers are product people.
- Keep each fact to one short sentence, with at most three numbers. Describe a series by its pattern, low and high. Never list its values.
- Write dates as YYYY-MM-DD. Put no numbers in hypotheses or unknowns unless a function returned them.

Reply with only the word DECLINED, and call no functions, only when the question is unrelated to this product, such as a poem, a recipe or general knowledge. Questions about usage or releases are never declined.

When you have enough, reply with only this JSON and no other text. suggestion.feature is the feature the change is made to: reports, dashboards or sharing.
{"facts":[{"text":"...","query_id":"q1"}],"hypotheses":[{"text":"...","evidence_needed":"..."}],"unknowns":[{"text":"..."}],"suggestion":{"title":"one concrete product change","detail":"one or two sentences","feature":"..."}}`
}

async function complete(llm: LlmConfig, messages: Message[], signal: AbortSignal) {
  const response = await fetch(`${llm.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${llm.apiKey}` },
    body: JSON.stringify({
      model: llm.model,
      messages,
      tools: toolSchemas,
      tool_choice: 'auto',
      temperature: 0.1,
      max_tokens: 4000,
    }),
    signal,
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Nebius returned ${response.status}: ${body.slice(0, 200)}`)
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[]
  }
  const message = data.choices?.[0]?.message
  if (!message) throw new Error('Nebius returned no message')
  return message
}

function parseCard(content: string) {
  const withoutThinking = content.replace(/<think>[\s\S]*?<\/think>/g, '')
  const start = withoutThinking.indexOf('{')
  const end = withoutThinking.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return insightSchema.safeParse(JSON.parse(withoutThinking.slice(start, end + 1)))
  } catch {
    return null
  }
}

async function askModel(deps: AssistantDeps & { llm: LlmConfig }, question: string, ledger: Ledger) {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const messages: Message[] = [
    { role: 'system', content: await systemPrompt(deps.db) },
    { role: 'user', content: question },
  ]
  let corrections = 0

  for (let step = 0; step < MAX_STEPS; step++) {
    const message = await complete(deps.llm, messages, signal)
    const toolCalls = message.tool_calls ?? []

    if (toolCalls.length > 0) {
      messages.push({ role: 'assistant', content: message.content ?? '', tool_calls: toolCalls })
      for (const call of toolCalls) {
        let content: string
        try {
          const args = JSON.parse(call.function.arguments || '{}')
          const entry = await callFunction(deps.db, ledger, call.function.name, args)
          content = JSON.stringify({ query_id: entry.id, result: entry.result })
        } catch (error) {
          content = JSON.stringify({ error: (error as Error).message.slice(0, 300) })
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content })
      }
      continue
    }

    if (/^\s*DECLINED\b/.test(message.content ?? '')) throw new Declined()

    const parsed = parseCard(message.content ?? '')
    const problems = !parsed
      ? ['Reply with only the JSON object described in your instructions.']
      : !parsed.success
        ? parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        : ledger.entries.length === 0
          ? ['Call a function first. Every fact must come from a function result.']
          : verifyInsight(parsed.data, ledger)

    if (problems.length === 0 && parsed?.success) {
      // Models sometimes leave the citation in the sentence. The link is the citation.
      const facts = parsed.data.facts.map((fact) => ({
        ...fact,
        text: fact.text.replace(/\s*\(?\bq\d+\b\)?/g, ''),
      }))
      return { ...parsed.data, facts }
    }
    if (corrections++ >= MAX_CORRECTIONS) {
      throw new Error(`Answer rejected by guardrails: ${problems[0]}`)
    }
    messages.push({ role: 'assistant', content: message.content ?? '' })
    messages.push({
      role: 'user',
      content: `That answer was rejected:\n- ${problems.join('\n- ')}\nFix it and send the full JSON again.`,
    })
  }
  throw new Error('The model did not finish within the step limit')
}

export type AssistantResult =
  | {
      ok: true
      card: InsightDraft & { queries: ReturnType<Ledger['publicQueries']> }
      mode: 'live' | 'scripted'
      model?: string
      notice?: string
    }
  | { ok: false; status: number; error: string; reason: string }

const hasScriptedCard = (question: string) => isDemoQuestion(question) || isBriefQuestion(question)

async function scripted(db: Db, question: string, notice?: string): Promise<AssistantResult> {
  const ledger = new Ledger()
  const build = isDemoQuestion(question) ? scriptedInsight : scriptedBrief
  const draft = await build(db, ledger)
  const problems = verifyInsight(draft, ledger)
  if (problems.length > 0) throw new Error(problems[0])
  return { ok: true, card: { ...draft, queries: ledger.publicQueries() }, mode: 'scripted', notice }
}

export async function answer(deps: AssistantDeps, question: string): Promise<AssistantResult> {
  if (!deps.llm) {
    if (hasScriptedCard(question)) return scripted(deps.db, question)
    return {
      ok: false,
      status: 422,
      error: 'scripted_only',
      reason: 'Without a Nebius key the assistant answers the report exports question and the weekly brief.',
    }
  }

  const ledger = new Ledger()
  try {
    const draft = await askModel({ ...deps, llm: deps.llm }, question, ledger)
    return {
      ok: true,
      card: { ...draft, queries: ledger.publicQueries() },
      mode: 'live',
      model: deps.llm.model,
    }
  } catch (error) {
    const reason = (error as Error).message
    console.error(`Assistant fallback: ${error instanceof Declined ? 'declined' : reason}`)
    if (hasScriptedCard(question)) {
      return scripted(
        deps.db,
        question,
        'The live model did not return a verified answer, so this is the scripted card.',
      )
    }
    if (error instanceof Declined) {
      return {
        ok: false,
        status: 422,
        error: 'off_topic',
        reason: 'I can only answer questions about how people use the product, such as adoption, funnels and releases.',
      }
    }
    return {
      ok: false,
      status: 502,
      error: 'assistant_unavailable',
      reason: reason.startsWith('Answer rejected')
        ? 'The model could not back its answer with measured numbers, so nothing is shown.'
        : `The live model is unavailable: ${reason}`,
    }
  }
}
