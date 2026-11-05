import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Building2, Download } from 'lucide-react'
import { useMemo } from 'react'
import { AccountDrawer } from '@/components/AccountDrawer'
import { HEALTH, HealthBadge } from '@/components/HealthBadge'
import { KpiCard } from '@/components/KpiCard'
import { PageHeader } from '@/components/Layout'
import { EmptyState, ErrorState, Loading, Refetching } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { UserTimelineDrawer } from '@/components/UserTimelineDrawer'
import { api, type Account, type Health } from '@/lib/api'
import { downloadCsv } from '@/lib/csv'
import { useFilters, useMeta } from '@/lib/filters'
import { cn, formatCount, formatDate, titleCase } from '@/lib/utils'

type SortKey = 'risk' | 'name' | 'seats' | 'change' | 'lapsed'

const SEVERITY: Record<Health, number> = { at_risk: 0, watch: 1, healthy: 2 }

const SORTERS: Record<SortKey, (a: Account, b: Account) => number> = {
  risk: (a, b) => SEVERITY[b.health] - SEVERITY[a.health] || (b.changePct ?? 0) - (a.changePct ?? 0),
  name: (a, b) => a.name.localeCompare(b.name),
  seats: (a, b) => a.seats - b.seats,
  change: (a, b) => (a.changePct ?? 0) - (b.changePct ?? 0),
  lapsed: (a, b) => a.lapsed - b.lapsed,
}

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Account' },
  { key: 'risk', label: 'Health' },
  { key: 'seats', label: 'Active seats', numeric: true },
  { key: 'change', label: 'Week on week', numeric: true },
  { key: 'lapsed', label: 'Lapsed', numeric: true },
]

export function Accounts() {
  const meta = useMeta()
  const { plan, params, update } = useFilters()
  const health = (params.get('health') ?? undefined) as Health | undefined
  const sort = (params.get('sort') ?? 'risk') as SortKey
  const direction = params.get('dir') === 'asc' ? 'asc' : 'desc'
  const selectedAccount = params.get('account') ? Number(params.get('account')) : undefined
  const selectedUser = params.get('user') ? Number(params.get('user')) : undefined

  const query = useQuery({
    queryKey: ['accounts', plan],
    queryFn: () => api.accounts(plan),
    placeholderData: keepPreviousData,
  })

  const rows = useMemo(() => {
    const factor = direction === 'asc' ? 1 : -1
    return [...(query.data?.accounts ?? [])]
      .filter((account) => !health || account.health === health)
      .sort((a, b) => SORTERS[sort](a, b) * factor)
  }, [query.data, health, sort, direction])

  const toggle = (key: SortKey) =>
    update({
      sort: key,
      dir: key === sort ? (direction === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc',
    })

  const download = () =>
    downloadCsv(
      'accounts.csv',
      ['account', 'plan', 'health', 'seats', 'active_this_week', 'active_last_week', 'change_pct', 'lapsed', 'last_active'],
      rows.map((a) => [
        a.name,
        a.plan,
        a.health,
        a.seats,
        a.active_now,
        a.active_before,
        a.changePct,
        a.lapsed,
        a.last_active?.slice(0, 10),
      ]),
    )

  const summary = query.data?.summary
  const queries = query.data?.queries ?? []

  return (
    <>
      <PageHeader
        title="Accounts"
        description={`Which customers are growing, and which are going quiet. Week ending ${formatDate(meta.dataEnd)}.`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="Plan"
            allLabel="All plans"
            value={plan}
            options={meta.plans.map((value) => ({ value, label: titleCase(value) }))}
            onChange={(value) => update({ plan: value })}
          />
          <Select
            label="Health"
            allLabel="All health"
            value={health}
            options={(Object.keys(HEALTH) as Health[]).map((value) => ({ value, label: HEALTH[value].label }))}
            onChange={(value) => update({ health: value })}
          />
          <Button className="sm:ml-auto" onClick={download} disabled={rows.length === 0}>
            <Download />
            Export CSV
          </Button>
        </div>
      </PageHeader>

      {summary && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <KpiCard label="At risk" value={summary.atRisk} hint="Lost half their active seats or more" queries={queries} />
          <KpiCard label="Watch" value={summary.watch} hint="Lost a quarter or more" queries={queries} />
          <KpiCard label="Healthy" value={summary.healthy} hint="Steady or growing" queries={queries} />
        </div>
      )}

      <Card>
        {query.isPending && <Loading />}
        {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
        {query.data && rows.length === 0 && (
          <EmptyState icon={Building2} title="No accounts match these filters">
            Try another plan or health.
          </EmptyState>
        )}
        {rows.length > 0 && (
          <Refetching active={query.isPlaceholderData}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    {COLUMNS.map((column) => (
                      <th
                        key={column.key}
                        aria-sort={sort === column.key ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={cn('px-5 py-2.5 font-medium', column.numeric && 'text-right')}
                      >
                        <button
                          onClick={() => toggle(column.key)}
                          className={cn(
                            'inline-flex items-center gap-1 text-[12.5px] transition-colors hover:text-ink',
                            sort === column.key ? 'text-ink' : 'text-ink-3',
                          )}
                        >
                          {column.label}
                          {sort === column.key &&
                            (direction === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                        </button>
                      </th>
                    ))}
                    <th className="pr-5 text-right text-[12.5px] font-medium whitespace-nowrap text-ink-3">
                      Last active
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((account) => (
                    <tr
                      key={account.id}
                      onClick={() => update({ account: String(account.id) })}
                      className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface-2/60"
                    >
                      <td className="px-5 py-3">
                        <span className="block text-[14px] font-medium">{account.name}</span>
                        <span className="block text-[12.5px] text-ink-3">{titleCase(account.plan)}</span>
                      </td>
                      <td className="px-5 py-3">
                        <HealthBadge health={account.health} />
                      </td>
                      <td className="px-5 py-3 text-right text-[13.5px] tabular-nums">
                        {formatCount(account.active_now)}
                        <span className="text-ink-3"> of {formatCount(account.seats)}</span>
                      </td>
                      <td className="px-5 py-3 text-right text-[13.5px] font-medium tabular-nums">
                        {account.changePct === null
                          ? '—'
                          : `${account.changePct > 0 ? '+' : account.changePct < 0 ? '−' : ''}${Math.abs(account.changePct)}%`}
                      </td>
                      <td className="px-5 py-3 text-right text-[13.5px] tabular-nums">{account.lapsed}</td>
                      <td className="pr-5 text-right text-[12.5px] whitespace-nowrap text-ink-3">
                        {account.last_active && formatDate(account.last_active).replace(/, \d{4}$/, '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Refetching>
        )}
      </Card>

      <AccountDrawer
        accountId={selectedUser === undefined ? selectedAccount : undefined}
        onClose={() => update({ account: undefined })}
        onSelectUser={(user) => update({ user: String(user) })}
      />
      <UserTimelineDrawer userId={selectedUser} onClose={() => update({ user: undefined })} />
    </>
  )
}
