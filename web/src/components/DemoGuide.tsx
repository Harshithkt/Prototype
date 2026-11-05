import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Sheet } from '@/components/ui/dialog'
import { useMeta } from '@/lib/filters'
import { addDays, formatDay } from '@/lib/utils'

export function DemoGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const meta = useMeta()
  const steps = [
    { to: '/', title: 'Read the Overview', body: 'DAU, WAU and MAU, with the trend for the last 30 days.' },
    { to: '/', title: 'Show agent and bot traffic', body: 'Flip the toggle and watch how much it inflates DAU.' },
    { to: '/features', title: 'Sort features by adoption', body: 'Reports ranks at the top.' },
    { to: '/features/1', title: 'Open Reports', body: 'Most users open a report. Few export one.' },
    { to: '/features/1', title: 'Find a lapsed user', body: 'Filter by plan, then click a dot in the lapsed band to read their timeline.' },
    { to: '/assistant', title: 'Ask the assistant', body: '“Why aren’t users exporting reports?” Then create a recommendation from the card.' },
    { to: '/recommendations', title: 'Approve and ship', body: `Approve it, then ship on ${formatDay(meta.shipDate)} with Pro as the treated plan.` },
    { to: '/recommendations', title: 'Read the result', body: 'Treated against control, before and after, with the caveat.' },
  ]
  const extras = [
    { to: '/', title: 'What to fix first', body: 'Ranked problems on the Overview, sized by the users affected.' },
    { to: `/features/2?from=${addDays(meta.dataEnd, -29)}&to=${meta.dataEnd}&platform=mobile`, title: 'See a usage drop', body: 'A two-day collapse in Dashboards on mobile, marked on the trend.' },
    { to: '/retention', title: 'Check retention', body: 'Weekly cohorts, split by plan or platform.' },
    { to: '/accounts?health=at_risk', title: 'Save an account', body: 'Accounts losing seats, the people behind them, and a list to export.' },
    { to: `/assistant?ask=${encodeURIComponent("Give me this week's brief")}`, title: 'Get the weekly brief', body: 'A plain summary to paste into Slack or an email.' },
  ]
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Demo script"
      description="Eight steps, about ten minutes, from a drop-off to a measured result."
    >
      <ol className="px-3 py-3">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Link
              to={step.to}
              onClick={() => onOpenChange(false)}
              className="group flex gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2"
            >
              <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11.5px] font-semibold text-ink-2 tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold">{step.title}</span>
                <span className="block text-[13px] text-ink-2">{step.body}</span>
              </span>
              <ArrowUpRight className="mt-0.5 size-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ol>
      <div className="border-t border-line px-3 py-3">
        <h3 className="px-3 pb-1 text-[12.5px] font-semibold text-ink-3">Go further</h3>
        <ul>
          {extras.map((step) => (
            <li key={step.title}>
              <Link
                to={step.to}
                onClick={() => onOpenChange(false)}
                className="group flex gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold">{step.title}</span>
                  <span className="block text-[13px] text-ink-2">{step.body}</span>
                </span>
                <ArrowUpRight className="mt-0.5 size-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  )
}
