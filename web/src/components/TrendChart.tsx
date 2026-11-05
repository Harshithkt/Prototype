import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCount, formatDay } from '@/lib/utils'

export type TrendPoint = { day: string; humans: number; all?: number }
export type Highlight = { from: string; to: string; label: string }

const SERIES = [
  { key: 'humans', label: 'Humans', color: 'var(--series-1)' },
  { key: 'all', label: 'Humans, agents and bots', color: 'var(--series-2)' },
] as const

const TICK_STEPS = [5, 10, 20, 50, 100, 200, 500, 1000]
const niceStep = (peak: number) => TICK_STEPS.find((step) => peak / step <= 5) ?? 2000

type TooltipProps = {
  active?: boolean
  label?: string
  payload?: { dataKey: string; value: number }[]
  seriesLabel?: string
}

function TrendTooltip({ active, label, payload, seriesLabel }: TooltipProps) {
  if (!active || !payload?.length || !label) return null
  const rows = SERIES.flatMap((series) => {
    const entry = payload.find((p) => p.dataKey === series.key)
    if (!entry) return []
    return [{ ...series, label: (series.key === 'humans' && seriesLabel) || series.label, value: entry.value }]
  })
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-float">
      <p className="text-[12px] text-ink-3">{formatDay(label)}</p>
      {rows.map((row) => (
        <p key={row.key} className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-2">
          <span className="h-0.5 w-3 rounded-full" style={{ background: row.color }} />
          <span className="font-semibold text-ink tabular-nums">{formatCount(row.value)}</span>
          {row.label}
        </p>
      ))}
    </div>
  )
}

function EndDot({ cx, cy, index, last, color, value }: {
  cx?: number
  cy?: number
  index?: number
  last: number
  color: string
  value?: number
}) {
  if (index !== last || cx === undefined || cy === undefined) return null
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
      <text x={cx + 9} y={cy + 4} fontSize={12} fontWeight={600} fill="var(--ink)">
        {value === undefined ? '' : formatCount(value)}
      </text>
    </g>
  )
}

type DotProps = { key?: string; cx?: number; cy?: number; index?: number; value?: number }

// Recharts passes a key inside the props, and React refuses a spread key.
const endDot = (last: number, color: string) =>
  function renderEndDot({ key, ...props }: DotProps) {
    return <EndDot key={key} {...props} last={last} color={color} />
  }

export function TrendChart({
  data,
  height = 300,
  highlights = [],
  seriesLabel,
}: {
  data: TrendPoint[]
  height?: number
  highlights?: Highlight[]
  seriesLabel?: string
}) {
  const hasAll = data.some((point) => point.all !== undefined)
  const last = data.length - 1
  const peak = Math.max(...data.flatMap((point) => [point.humans, point.all ?? 0]))
  const step = niceStep(peak)
  const ticks = Array.from({ length: Math.ceil(peak / step) + 1 }, (_, index) => index * step)
  const tick = { fontSize: 12, fill: 'var(--ink-3)' }
  return (
    <div>
      {hasAll && (
        <div className="mb-2 flex flex-wrap gap-4 px-1">
          {SERIES.map((series) => (
            <span key={series.key} className="flex items-center gap-2 text-[12.5px] text-ink-2">
              <span className="h-0.5 w-4 rounded-full" style={{ background: series.color }} />
              {series.label}
            </span>
          ))}
        </div>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 44, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="day"
              tickFormatter={formatDay}
              tick={tick}
              tickLine={false}
              axisLine={{ stroke: 'var(--axis)' }}
              minTickGap={56}
              tickMargin={8}
            />
            <YAxis
              tick={tick}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={formatCount}
              allowDecimals={false}
              domain={[0, ticks.at(-1) ?? 'auto']}
              ticks={ticks}
            />
            {highlights.map((highlight) => (
              <ReferenceArea
                key={highlight.from}
                x1={highlight.from}
                x2={highlight.to}
                fill="var(--bad-ink)"
                fillOpacity={0.1}
                stroke="none"
                label={{
                  value: highlight.label,
                  position: 'insideTop',
                  fontSize: 12,
                  fontWeight: 500,
                  fill: 'var(--ink-2)',
                }}
              />
            ))}
            <Tooltip
              content={<TrendTooltip seriesLabel={seriesLabel} />}
              cursor={{ stroke: 'var(--line-2)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="humans"
              fill="var(--series-1)"
              fillOpacity={0.08}
              stroke="none"
              isAnimationActive={false}
              activeDot={false}
              tooltipType="none"
            />
            {hasAll && (
              <Line
                type="monotone"
                dataKey="all"
                stroke="var(--series-2)"
                strokeWidth={2}
                dot={endDot(last, 'var(--series-2)')}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="humans"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={endDot(last, 'var(--series-1)')}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
