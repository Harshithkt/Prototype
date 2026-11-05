import { z } from 'zod'
import { FUNCTION_NAMES, type Ledger, type LedgerEntry } from './functions.js'

export const insightSchema = z.object({
  facts: z.array(z.object({ text: z.string().min(1), query_id: z.string().min(1) })).min(1),
  hypotheses: z.array(z.object({ text: z.string().min(1), evidence_needed: z.string().min(1) })),
  unknowns: z.array(z.object({ text: z.string().min(1) })),
  suggestion: z
    .object({
      title: z.string().min(1),
      detail: z.string().min(1),
      feature: z.enum(['reports', 'dashboards', 'sharing']),
    })
    .optional(),
})

export type InsightDraft = z.infer<typeof insightSchema>

const CAUSAL = /\b(because|caused|causes|due to|as a result|leads? to|led to|drives?|driven by|results? in)\b/i

// 7 is the funnel definition itself ("within 7 days"), not a measurement.
const DEFINITIONAL = new Set([7])

function numbersIn(text: string) {
  const withoutDates = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
  const matches = withoutDates.match(/(?<![\w.])\d[\d,]*(?:\.\d+)?/g) ?? []
  return matches.map((raw) => {
    const clean = raw.replace(/,/g, '')
    return { raw, value: Number(clean), decimals: clean.split('.')[1]?.length ?? 0 }
  })
}

function collectNumbers(value: unknown, into: number[] = []) {
  if (typeof value === 'number') into.push(value)
  // Server-written text like "fell 71%" carries measured numbers too.
  else if (typeof value === 'string') numbersIn(value).forEach((number) => into.push(number.value))
  else if (Array.isArray(value)) value.forEach((item) => collectNumbers(item, into))
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectNumbers(item, into))
  }
  return into
}

function isBacked(number: ReturnType<typeof numbersIn>[number], known: number[]) {
  if (DEFINITIONAL.has(number.value)) return true
  const tolerance = 0.5 * 10 ** -number.decimals + 1e-9
  // Text drops the sign ("fell 0.1 pts", or a typographic minus), so compare sizes.
  return known.some((value) => Math.abs(number.value - Math.abs(value)) <= tolerance)
}

const knownNumbers = (entries: LedgerEntry[]) => entries.flatMap((entry) => collectNumbers(entry.result))

/** Returns what is wrong with a card, empty when it may be shown. */
export function verifyInsight(card: InsightDraft, ledger: Ledger) {
  const problems: string[] = []

  for (const fact of card.facts) {
    const entry = ledger.find(fact.query_id)
    if (!entry) {
      problems.push(`The fact "${fact.text}" cites ${fact.query_id}, which was not run in this request.`)
      continue
    }
    const known = knownNumbers([entry])
    for (const number of numbersIn(fact.text)) {
      if (!isBacked(number, known)) {
        problems.push(`The fact "${fact.text}" states ${number.raw}, which ${fact.query_id} did not return.`)
      }
    }
    if (CAUSAL.test(fact.text)) {
      problems.push(`The fact "${fact.text}" makes a causal claim. Move it to hypotheses.`)
    }
  }

  const allKnown = knownNumbers(ledger.entries)
  const prose = [...card.hypotheses.map((h) => h.text), ...card.unknowns.map((u) => u.text)]
  for (const text of prose) {
    for (const number of numbersIn(text)) {
      if (!isBacked(number, allKnown)) {
        problems.push(`"${text}" states ${number.raw}, which no query returned.`)
      }
    }
  }

  const everything = [
    ...card.facts.map((f) => f.text),
    ...card.hypotheses.flatMap((h) => [h.text, h.evidence_needed]),
    ...card.unknowns.map((u) => u.text),
    ...(card.suggestion ? [card.suggestion.title, card.suggestion.detail] : []),
  ]
  for (const text of everything) {
    const name = FUNCTION_NAMES.find((fn) => text.includes(fn))
    if (name) {
      problems.push(`"${text}" names ${name}. Call it now if it helps, and describe data in plain language.`)
    }
  }
  return problems
}
