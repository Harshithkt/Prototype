import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { QueryPopover } from '@/components/QueryPopover'
import { ErrorState, Loading } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/dialog'
import { api, type AccountUser } from '@/lib/api'
import { downloadCsv } from '@/lib/csv'
import { cn, formatDate, titleCase } from '@/lib/utils'

const LAPSED_DAYS = 14

const isLapsed = (user: AccountUser) =>
  user.days_since_last_use === null || user.days_since_last_use >= LAPSED_DAYS

const lastUsed = (user: AccountUser) => {
  if (user.days_since_last_use === null) return 'Never active'
  if (user.days_since_last_use === 0) return 'Active today'
  if (user.days_since_last_use === 1) return 'Yesterday'
  return `${user.days_since_last_use} days ago`
}

export function AccountDrawer({
  accountId,
  onClose,
  onSelectUser,
}: {
  accountId: number | undefined
  onClose: () => void
  onSelectUser: (userId: number) => void
}) {
  const query = useQuery({
    queryKey: ['account-users', accountId],
    queryFn: () => api.accountUsers(accountId!),
    enabled: accountId !== undefined,
  })
  const account = query.data?.account
  const users = query.data?.users ?? []

  const download = () =>
    downloadCsv(
      `${account?.name ?? 'account'} people.csv`,
      ['user', 'plan', 'platform', 'last_active', 'days_since_last_use', 'events'],
      users.map((u) => [
        u.external_id,
        u.plan,
        u.platform,
        u.last_event?.slice(0, 10),
        u.days_since_last_use,
        u.events,
      ]),
    )

  return (
    <Sheet
      open={accountId !== undefined}
      onOpenChange={(open) => !open && onClose()}
      title={account?.name ?? 'Account'}
      description={account && `${titleCase(account.plan)} plan · ${users.length} seats`}
    >
      {query.isPending && <Loading />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && (
        <div className="px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-3 px-3">
            <span className="text-[13px] text-ink-3">Quietest people first</span>
            <span className="flex items-center gap-1">
              <QueryPopover queries={query.data.queries} label="Query" />
              <Button size="sm" onClick={download}>
                <Download />
                CSV
              </Button>
            </span>
          </div>
          <ul>
            {users.map((user) => (
              <li key={user.id}>
                <button
                  onClick={() => onSelectUser(user.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-[13px] font-medium">{user.external_id}</span>
                    <span className="block text-[12.5px] text-ink-3">
                      {titleCase(user.platform ?? 'unknown')}
                      {user.last_event && ` · last active ${formatDate(user.last_event)}`}
                    </span>
                  </span>
                  <span className={cn('shrink-0 text-[12.5px] tabular-nums', isLapsed(user) ? 'font-semibold text-bad-ink' : 'text-ink-3')}>
                    {lastUsed(user)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  )
}
