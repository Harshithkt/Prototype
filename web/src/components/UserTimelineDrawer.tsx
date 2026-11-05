import { useQuery } from '@tanstack/react-query'
import { BarChart3, Download, LayoutDashboard, Share2, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { QueryPopover } from '@/components/QueryPopover'
import { ErrorState, Loading } from '@/components/States'
import { Sheet } from '@/components/ui/dialog'
import { api, type TimelineEvent } from '@/lib/api'
import { formatDate, formatDay, formatTime, titleCase } from '@/lib/utils'

const EVENT_DISPLAY: Record<string, { label: string; icon: LucideIcon }> = {
  report_opened: { label: 'Opened a report', icon: BarChart3 },
  report_exported: { label: 'Exported a report', icon: Download },
  dashboard_viewed: { label: 'Viewed a dashboard', icon: LayoutDashboard },
  share_clicked: { label: 'Clicked share', icon: Share2 },
}

const detail = ({ report, dashboard, channel, format }: Record<string, unknown>) =>
  [report, dashboard, channel, format].filter(Boolean).map(String).join(' · ')

function groupByDay(events: TimelineEvent[]) {
  const groups: { day: string; events: TimelineEvent[] }[] = []
  for (const event of events) {
    const day = event.occurred_at.slice(0, 10)
    const group = groups.at(-1)
    if (group?.day === day) group.events.push(event)
    else groups.push({ day, events: [event] })
  }
  return groups
}

export function UserTimelineDrawer({
  userId,
  onClose,
}: {
  userId: number | undefined
  onClose: () => void
}) {
  const query = useQuery({
    queryKey: ['timeline', userId],
    queryFn: () => api.timeline(userId!),
    enabled: userId !== undefined,
  })
  const groups = useMemo(() => groupByDay(query.data?.events ?? []), [query.data])
  const user = query.data?.user

  return (
    <Sheet
      open={userId !== undefined}
      onOpenChange={(open) => !open && onClose()}
      title={<span className="font-mono text-[15px]">{user?.external_id ?? 'User'}</span>}
      description={
        user && (
          <span>
            {user.account ?? 'No account'} · {titleCase(user.plan ?? 'no plan')} ·{' '}
            {titleCase(user.platform ?? 'unknown')}
          </span>
        )
      }
    >
      {query.isPending && <Loading />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && (
        <div className="px-6 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[13px] text-ink-3">
              {user?.last_seen_at ? `Last seen ${formatDate(user.last_seen_at)}` : 'Not seen yet'}
            </span>
            <QueryPopover queries={query.data.queries} className="-mr-1.5" />
          </div>
          {groups.length === 0 && (
            <p className="py-10 text-center text-[13.5px] text-ink-3">No events for this user.</p>
          )}
          {groups.map((group) => (
            <section key={group.day} className="mb-5">
              <h3 className="sticky top-0 bg-surface py-1 text-[12.5px] font-semibold text-ink-2">
                {formatDay(group.day)}
              </h3>
              <ol className="mt-1">
                {group.events.map((event, index) => {
                  const display = EVENT_DISPLAY[event.event_name]
                  const Icon = display?.icon ?? BarChart3
                  const text = detail(event.properties)
                  return (
                    <li key={`${event.occurred_at}-${index}`} className="flex gap-3 py-1.5">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2">
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium">
                          {display?.label ?? event.event_name}
                        </span>
                        {text && <span className="block truncate text-[12.5px] text-ink-3">{text}</span>}
                      </span>
                      <span className="text-[12.5px] text-ink-3 tabular-nums">
                        {formatTime(event.occurred_at)}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Sheet>
  )
}
