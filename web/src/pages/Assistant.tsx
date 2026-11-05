import { ChatPanel } from '@/components/ChatPanel'
import { PageHeader } from '@/components/Layout'
import { Card } from '@/components/ui/card'
import { useMeta } from '@/lib/filters'

const FUNCTIONS = [
  ['get_active_users', 'DAU, WAU and MAU'],
  ['get_feature_adoption', 'Adoption and counts'],
  ['get_funnel', 'Open to export'],
  ['compare_segments', 'Adoption by plan or platform'],
  ['compare_funnel', 'Export rate by plan or platform'],
  ['get_retention', 'Weekly cohorts'],
  ['get_account_health', 'Accounts at risk'],
  ['get_priorities', 'What to fix first'],
  ['measure_change', 'Before and after, with control'],
]

export function Assistant() {
  const meta = useMeta()
  const live = meta.assistant.mode === 'live'
  return (
    <>
      <PageHeader title="Assistant" description="Plain-language answers, labelled by evidence." />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_252px]">
        <ChatPanel />
        <aside className="sticky top-8 hidden space-y-4 lg:block">
          <Card className="p-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold">
              <span
                className="size-2 rounded-full"
                style={{ background: live ? 'var(--good-ink)' : 'var(--ink-3)' }}
              />
              {live ? 'Live model' : 'Scripted mode'}
            </p>
            <p className="mt-1 text-[12.5px] break-words text-ink-3">
              {live ? meta.assistant.model : 'Add a Nebius key to .env for live answers.'}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-[13px] font-semibold">Nine approved functions</p>
            <p className="mt-1 text-[12.5px] text-ink-3">
              The model calls these and nothing else. It never writes SQL or sees a table.
            </p>
            <ul className="mt-3 space-y-2.5">
              {FUNCTIONS.map(([name, summary]) => (
                <li key={name}>
                  <code className="block font-mono text-[11.5px] font-medium">{name}</code>
                  <span className="text-[12.5px] text-ink-3">{summary}</span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  )
}
