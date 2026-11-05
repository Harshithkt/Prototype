import type { Db } from './db.js'
import {
  accountHealth,
  anomalies,
  featureList,
  funnel,
  type DateRange,
  type QueryRecord,
} from './metrics.js'

export type Priority = {
  id: string
  kind: 'incident' | 'funnel' | 'adoption' | 'accounts'
  title: string
  detail: string
  usersAffected: number
  href: string
  question: string
  queries: QueryRecord[]
}

const LOW_ADOPTION_PCT = 50

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

const dayRange = (from: string, to: string) =>
  from === to ? shortDay(from) : `${shortDay(from)} to ${shortDay(to)}`

/**
 * What to fix first. Every item is a measured number from the metrics layer,
 * ranked by the people affected, with live incidents ahead of slower problems.
 */
export async function priorities(db: Db, range: DateRange) {
  const search = `from=${range.from}&to=${range.to}`
  const [exports, features, health, unusual] = await Promise.all([
    funnel(db, range),
    featureList(db, range),
    accountHealth(db, { to: range.to }),
    anomalies(db, range),
  ])
  const reports = features.find((f) => f.key === 'reports')
  const items: Priority[] = []

  for (const event of unusual.anomalies.filter((a) => a.direction === 'drop')) {
    items.push({
      id: `incident-${event.featureId}-${event.platform}-${event.from}`,
      kind: 'incident',
      title: `${event.feature} on ${event.platform} fell ${Math.abs(event.changePct)}%, ${dayRange(event.from, event.to)}`,
      detail: `${event.users} users on its worst day against a usual ${event.baseline}.`,
      usersAffected: Math.round(event.baseline - event.users),
      href: `/features/${event.featureId}?${search}&platform=${event.platform}`,
      question: `What happened to ${event.feature} on ${event.platform} around ${event.from}?`,
      queries: unusual.queries,
    })
  }

  const notExported = exports.opened - exports.exported
  if (reports && notExported > 0) {
    items.push({
      id: 'funnel-reports',
      kind: 'funnel',
      title: `${notExported} users opened a report and never exported it`,
      detail: `${exports.conversionPct}% of openers export within 7 days.`,
      usersAffected: notExported,
      href: `/features/${reports.id}?${search}`,
      question: "Why aren't users exporting reports?",
      queries: exports.queries,
    })
  }

  for (const feature of features) {
    const gap = feature.usersActive - feature.usersUsed
    if (feature.adoptionPct === null || feature.adoptionPct >= LOW_ADOPTION_PCT) continue
    items.push({
      id: `adoption-${feature.key}`,
      kind: 'adoption',
      title: `${gap} active users have not tried ${feature.name}`,
      detail: `Only ${feature.adoptionPct}% adoption in this period.`,
      usersAffected: gap,
      href: `/features/${feature.id}?${search}`,
      question: `How is ${feature.name} adoption split by plan?`,
      queries: feature.queries,
    })
  }

  const atRisk = health.accounts.filter((a) => a.health === 'at_risk')
  if (atRisk.length > 0) {
    const seatsLost = atRisk.reduce((sum, a) => sum + a.active_before - a.active_now, 0)
    items.push({
      id: 'accounts-at-risk',
      kind: 'accounts',
      title: `${atRisk.length} accounts lost most of their active seats`,
      detail: `${seatsLost} fewer active seats this week than last.`,
      usersAffected: seatsLost,
      href: '/accounts?health=at_risk',
      question: 'Which accounts are at risk, and why should we care?',
      queries: health.queries,
    })
  }

  const queries = [...exports.queries, ...unusual.queries, ...health.queries]
  const rank = (item: Priority) => (item.kind === 'incident' ? 1 : 0)
  items.sort((a, b) => rank(b) - rank(a) || b.usersAffected - a.usersAffected)
  return { items, queries }
}
