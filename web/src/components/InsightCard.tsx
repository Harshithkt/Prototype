import { ArrowRight, Check, CircleHelp, Copy, FlaskConical, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { QueryPopover } from '@/components/QueryPopover'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Insight } from '@/lib/api'
import { cn } from '@/lib/utils'

const TAGS = {
  measured: { label: 'Measured', icon: ShieldCheck, className: 'bg-good-wash text-good-ink' },
  hypothesis: { label: 'Hypothesis', icon: FlaskConical, className: 'bg-warn-wash text-warn-ink' },
  unknown: { label: 'Unknown', icon: CircleHelp, className: 'bg-surface-2 text-ink-2' },
} satisfies Record<string, { label: string; icon: LucideIcon; className: string }>

function Tag({ kind }: { kind: keyof typeof TAGS }) {
  const { label, icon: Icon, className } = TAGS[kind]
  return (
    <span
      className={cn(
        'inline-flex h-5.5 w-fit shrink-0 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-semibold',
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} />
      {label}
    </span>
  )
}

function Row({ kind, children, aside }: { kind: keyof typeof TAGS; children: ReactNode; aside?: ReactNode }) {
  return (
    <li className="grid gap-x-3 gap-y-1 border-t border-line py-3 first:border-0 sm:grid-cols-[92px_1fr_auto]">
      <Tag kind={kind} />
      <div className="min-w-0 text-[14px] leading-[1.55]">{children}</div>
      {aside && <div className="-mt-0.5 -mr-1.5">{aside}</div>}
    </li>
  )
}

/** Plain text with the evidence labels kept, ready to paste into Slack or an email. */
function asSummary(insight: Insight) {
  const section = (title: string, lines: string[]) =>
    lines.length ? [`${title}:`, ...lines.map((line) => `- ${line}`), ''] : []
  return [
    insight.question,
    '',
    ...section('Measured', insight.facts.map((fact) => fact.text)),
    ...section('Hypotheses', insight.hypotheses.map((h) => `${h.text} (needs: ${h.evidence_needed})`)),
    ...section('Unknown', insight.unknowns.map((unknown) => unknown.text)),
  ]
    .join('\n')
    .trim()
}

function CopySummary({ insight }: { insight: Insight }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(asSummary(insight))
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  return (
    <Button onClick={copy}>
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : 'Copy summary'}
    </Button>
  )
}

export function InsightCard({
  insight,
  onCreateRecommendation,
}: {
  insight: Insight
  onCreateRecommendation: () => void
}) {
  const queriesById = new Map(insight.queries.map((query) => [query.id, query]))
  return (
    <Card className="animate-rise overflow-hidden">
      <ul className="px-5 py-1">
        {insight.facts.map((fact) => {
          const query = queriesById.get(fact.query_id)
          return (
            <Row key={fact.text} kind="measured" aside={query && <QueryPopover queries={[query]} />}>
              {fact.text}
            </Row>
          )
        })}
        {insight.hypotheses.map((hypothesis) => (
          <Row key={hypothesis.text} kind="hypothesis">
            {hypothesis.text}
            <span className="mt-0.5 block text-[13px] text-ink-3">
              Evidence needed: {hypothesis.evidence_needed}
            </span>
          </Row>
        ))}
        {insight.unknowns.map((unknown) => (
          <Row key={unknown.text} kind="unknown">
            {unknown.text}
          </Row>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/50 px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
          <QueryPopover
            queries={insight.queries}
            label={`${insight.queries.length} ${insight.queries.length === 1 ? 'query' : 'queries'} ran`}
            className="-ml-1.5"
          />
          <span>
            {insight.mode === 'live' ? `Answered by ${insight.model}` : 'Scripted answer, live numbers'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopySummary insight={insight} />
          <Button variant="primary" onClick={onCreateRecommendation}>
            Create recommendation
            <ArrowRight />
          </Button>
        </div>
      </div>
    </Card>
  )
}
