import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { QueryPopover } from '@/components/QueryPopover'
import { Card, CardHeader } from '@/components/ui/card'
import type { Funnel } from '@/lib/api'
import { formatCount, formatPct } from '@/lib/utils'

type TooltipProps = {
  active?: boolean
  payload?: { payload: { label: string; value: number } }[]
}

function StepTooltip({ active, payload }: TooltipProps) {
  const step = payload?.[0]?.payload
  if (!active || !step) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-float">
      <p className="text-[13px] font-semibold tabular-nums">{formatCount(step.value)} users</p>
      <p className="text-[12.5px] text-ink-2">{step.label}</p>
    </div>
  )
}

export function FunnelChart({ funnel }: { funnel: Funnel }) {
  const steps = [
    { label: 'Opened a report', value: funnel.opened, color: 'var(--funnel-1)' },
    { label: 'Exported it', value: funnel.exported, color: 'var(--funnel-2)' },
  ]
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Open to export"
        description="Users who exported within 7 days of opening a report"
        action={<QueryPopover queries={funnel.queries} className="-mr-1.5" />}
      />
      <div className="flex flex-1 flex-col gap-6 px-5 pt-4 pb-5 sm:flex-row sm:items-center">
        <div className="shrink-0 sm:w-[150px]">
          <div className="text-[48px] leading-none font-semibold tracking-[-0.035em]">
            {formatPct(funnel.conversionPct)}
          </div>
          <div className="mt-2 text-[13px] text-ink-3">conversion</div>
        </div>
        <div className="h-[116px] min-w-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={steps} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }}>
              <XAxis type="number" hide domain={[0, Math.max(funnel.opened, 1)]} />
              <YAxis
                type="category"
                dataKey="label"
                width={112}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 13, fill: 'var(--ink-2)' }}
              />
              <Tooltip content={<StepTooltip />} cursor={false} isAnimationActive={false} />
              <Bar dataKey="value" barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {steps.map((step) => (
                  <Cell key={step.label} fill={step.color} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(value: number) => formatCount(value)}
                  style={{ fontSize: 14, fontWeight: 600, fill: 'var(--ink)' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  )
}
