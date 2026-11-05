import type { Db } from '../db.js'
import { demo } from '../config.js'
import { addDays } from '../metrics.js'
import { callFunction, Ledger } from './functions.js'
import type { InsightDraft } from './guardrails.js'

export const DEMO_QUESTION = "Why aren't users exporting reports?"

export function defaultRange() {
  return { from: addDays(demo.dataEnd, -29), to: demo.dataEnd }
}

export const BRIEF_QUESTION = "Give me this week's brief"

export const isDemoQuestion = (question: string) => /export/i.test(question) && /report/i.test(question)
export const isBriefQuestion = (question: string) => /\b(brief|digest)\b/i.test(question)

type Funnel = { opened: number; exported: number; conversionPct: number | null }
type Adoption = { usersUsed: number; usersActive: number; adoptionPct: number | null }
type Segments = { segments: (Funnel & { plan: string })[] }
type Priorities = { priorities: { title: string; detail: string }[] }

const percent = (value: number | null) => (value === null ? 'no data' : `${value.toFixed(1)}%`)

/** The fallback card: precomputed wording, numbers from the same five functions. */
export async function scriptedInsight(db: Db, ledger: Ledger): Promise<InsightDraft> {
  const range = defaultRange()
  const funnel = await callFunction(db, ledger, 'get_funnel', range)
  const reach = await callFunction(db, ledger, 'get_feature_adoption', { ...range, feature: 'reports' })
  const byPlan = await callFunction(db, ledger, 'compare_funnel', { ...range, by: 'plan' })

  const { opened, exported, conversionPct } = funnel.result as Funnel
  const { usersUsed, usersActive, adoptionPct } = reach.result as Adoption
  const { segments } = byPlan.result as Segments
  const planList = segments.map((s) => `${s.plan} ${percent(s.conversionPct)}`).join(', ')

  return {
    facts: [
      {
        text: `${exported.toLocaleString('en-US')} of ${opened.toLocaleString('en-US')} users who opened a report exported within 7 days (${percent(conversionPct)}).`,
        query_id: funnel.id,
      },
      {
        text: `Reports reached ${usersUsed.toLocaleString('en-US')} of ${usersActive.toLocaleString('en-US')} active users (${percent(adoptionPct)}).`,
        query_id: reach.id,
      },
      { text: `Export rate by plan: ${planList}.`, query_id: byPlan.id },
    ],
    hypotheses: [
      {
        text: 'The export action is hard to find on the report screen.',
        evidence_needed: 'Click path data for the report screen',
      },
      {
        text: 'Most users get what they need by reading the report on screen.',
        evidence_needed: 'Time on report and a short in-product survey',
      },
    ],
    unknowns: [
      { text: 'Whether export errors occurred; no error events are tracked.' },
      { text: 'Which job users were trying to do when they opened the report.' },
    ],
    suggestion: {
      title: 'Add a clearer export action to the report screen',
      detail:
        'Move export out of the overflow menu and into a primary button on the report header, then compare export completion for the rollout plan against everyone else.',
      feature: 'reports',
    },
  }
}

/** The fallback weekly brief, read straight from the ranked priorities. */
export async function scriptedBrief(db: Db, ledger: Ledger): Promise<InsightDraft> {
  const range = defaultRange()
  const active = await callFunction(db, ledger, 'get_active_users', range)
  const ranked = await callFunction(db, ledger, 'get_priorities', range)
  const { dau, wau, mau } = active.result as { dau: number; wau: number; mau: number }
  const { priorities } = ranked.result as Priorities
  return {
    facts: [
      { text: `${dau} daily, ${wau} weekly and ${mau} monthly active users.`, query_id: active.id },
      ...priorities.slice(0, 3).map((item) => ({ text: item.title, query_id: ranked.id })),
    ],
    hypotheses: [],
    unknowns: [{ text: 'Why each of these changed. The numbers show what happened, not the cause.' }],
  }
}
