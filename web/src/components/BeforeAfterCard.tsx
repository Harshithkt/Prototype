import { useQuery } from '@tanstack/react-query'
import { CircleHelp, Info, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { QueryPopover } from '@/components/QueryPopover'
import { ErrorState, Loading } from '@/components/States'
import { api, type Measurement } from '@/lib/api'
import { cn, formatCount, formatDay, formatPct, formatPts, titleCase } from '@/lib/utils'

type Measured = Extract<Measurement, { measurable: true }>

const VERDICTS: Record<
  NonNullable<Measured['confidence']>['verdict'],
  { label: string; icon: LucideIcon; className: string }
> = {
  positive: { label: 'Clear improvement', icon: TrendingUp, className: 'bg-good-wash text-good-ink' },
  negative: { label: 'Clear decline', icon: TrendingDown, className: 'bg-bad-wash text-bad-ink' },
  unclear: { label: 'Too close to call', icon: CircleHelp, className: 'bg-surface-2 text-ink-2' },
}

function Verdict({ confidence }: { confidence: NonNullable<Measured['confidence']> }) {
  const { label, icon: Icon, className } = VERDICTS[confidence.verdict]
  return (
    <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
      <span className={cn('inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-semibold', className)}>
        <Icon className="size-3.5" strokeWidth={2.25} />
        {label}
      </span>
      95% range {formatPts(confidence.low).replace(' pts', '')} to {formatPts(confidence.high)}
    </p>
  )
}

const TREATED_COLOR = 'var(--series-1)'
const CONTROL_COLOR = 'var(--ink-3)'

/** A slope chart: two points per group, so the gap between the lines is the story. */
function Slope({ data }: { data: Measured }) {
  const series = [
    { key: 'Treated', color: TREATED_COLOR, before: data.treated.before.ratePct, after: data.treated.after.ratePct },
    { key: 'Control', color: CONTROL_COLOR, before: data.control.before.ratePct, after: data.control.after.ratePct },
  ]
  const values = series.flatMap((s) => [s.before ?? 0, s.after ?? 0])
  const max = Math.max(...values, 1) * 1.15
  const width = 340
  const height = 190
  const top = 12
  const bottom = 28
  const left = 58
  const right = width - 58
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom)

  // Keep the two labels on one side from landing on top of each other.
  const labelOffsets = (a: number | null, b: number | null) => {
    if (a === null || b === null) return [0, 0]
    const gap = Math.abs(y(a) - y(b))
    if (gap >= 15) return [0, 0]
    const nudge = (15 - gap) / 2
    return y(a) <= y(b) ? [-nudge, nudge] : [nudge, -nudge]
  }
  const beforeNudge = labelOffsets(series[0]!.before, series[1]!.before)
  const afterNudge = labelOffsets(series[0]!.after, series[1]!.after)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-[380px]" role="img" aria-label="Slope chart of export rate before and after, treated and control">
      {[left, right].map((x) => (
        <line key={x} x1={x} x2={x} y1={top} y2={height - bottom} stroke="var(--grid)" />
      ))}
      <text x={left} y={height - 8} textAnchor="middle" fontSize={12} fill="var(--ink-3)">Before</text>
      <text x={right} y={height - 8} textAnchor="middle" fontSize={12} fill="var(--ink-3)">After</text>
      {series.map((s, index) =>
        s.before === null || s.after === null ? null : (
          <g key={s.key}>
            <line x1={left} y1={y(s.before)} x2={right} y2={y(s.after)} stroke={s.color} strokeWidth={2} strokeLinecap="round" />
            <circle cx={left} cy={y(s.before)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            <circle cx={right} cy={y(s.after)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            <text x={left - 10} y={y(s.before) + 4 + (beforeNudge[index] ?? 0)} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--ink)">{formatPct(s.before)}</text>
            <text x={right + 10} y={y(s.after) + 4 + (afterNudge[index] ?? 0)} fontSize={12} fontWeight={600} fill="var(--ink)">{formatPct(s.after)}</text>
          </g>
        ),
      )}
    </svg>
  )
}

function Rate({ cell }: { cell: Measured['treated']['before'] }) {
  return (
    <td className="px-3 py-2.5 text-right text-[13.5px] tabular-nums">
      <span className="font-medium">{formatPct(cell.ratePct)}</span>
      <span className="block text-[12px] text-ink-3">
        {formatCount(cell.exported)} of {formatCount(cell.opened)}
      </span>
    </td>
  )
}

function Result({ data }: { data: Measured }) {
  const rows = [
    { key: 'treated', label: `Treated (${titleCase(data.treatedPlan)})`, color: TREATED_COLOR, group: data.treated },
    { key: 'control', label: 'Control (other plans)', color: CONTROL_COLOR, group: data.control },
  ]
  return (
    <div className="animate-rise">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col justify-between gap-4">
          <div>
            <div className="text-[13px] font-medium text-ink-2">Net change in export rate</div>
            <div className="mt-1.5 text-[48px] leading-none font-semibold tracking-[-0.035em]">
              {formatPts(data.liftPts)}
            </div>
            <p className="mt-2 text-[13px] text-ink-3">
              Treated change minus control change, {data.windowDays} days each side of{' '}
              {formatDay(data.shippedOn)}
            </p>
            {data.confidence && <Verdict confidence={data.confidence} />}
          </div>
          <div className="flex gap-4 text-[12.5px] text-ink-2">
            {rows.map((row) => (
              <span key={row.key} className="flex items-center gap-2">
                <span className="h-0.5 w-4 rounded-full" style={{ background: row.color }} />
                {row.key === 'treated' ? 'Treated' : 'Control'}
              </span>
            ))}
          </div>
        </div>
        <Slope data={data} />
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse">
          <thead>
            <tr className="border-b border-line text-[12.5px] text-ink-3">
              <th className="py-2 pr-3 text-left font-medium">Exported within 7 days</th>
              <th className="px-3 py-2 text-right font-medium">
                Before ({formatDay(data.windows.before.from)} – {formatDay(data.windows.before.to)})
              </th>
              <th className="px-3 py-2 text-right font-medium">
                After ({formatDay(data.windows.after.from)} – {formatDay(data.windows.after.to)})
              </th>
              <th className="py-2 pl-3 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-line last:border-0">
                <td className="py-2.5 pr-3 text-[13.5px] font-medium">{row.label}</td>
                <Rate cell={row.group.before} />
                <Rate cell={row.group.after} />
                <td className="py-2.5 pl-3 text-right text-[13.5px] font-medium tabular-nums">
                  {formatPts(row.group.changePts)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex gap-2.5 rounded-lg bg-warn-wash px-3.5 py-2.5 text-[13px] text-warn-ink">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          {data.caveat} This project uses synthetic data, and the lift shown here was planted in the
          seed.
        </p>
      </div>
      <div className="mt-2 flex justify-end">
        <QueryPopover queries={data.queries} className="-mr-1.5" />
      </div>
    </div>
  )
}

export function BeforeAfterCard({ id }: { id: number }) {
  const query = useQuery({ queryKey: ['measurement', id], queryFn: () => api.measurement(id) })
  if (query.isPending) return <Loading className="min-h-[160px]" />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data.measurable) {
    return <p className="py-4 text-[13.5px] text-ink-2">{query.data.reason}</p>
  }
  return <Result data={query.data} />
}
