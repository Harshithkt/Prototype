import { useQuery } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { ErrorState, Loading } from '@/components/States'
import { api } from '@/lib/api'
import { ConversationProvider } from '@/lib/conversation'
import { Accounts } from '@/pages/Accounts'
import { Assistant } from '@/pages/Assistant'
import { FeatureDetail } from '@/pages/FeatureDetail'
import { Features } from '@/pages/Features'
import { Overview } from '@/pages/Overview'
import { Recommendations } from '@/pages/Recommendations'
import { Retention } from '@/pages/Retention'

export function App() {
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity })
  if (meta.isPending) return <Loading className="min-h-screen" />
  if (meta.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ErrorState error={meta.error} onRetry={() => meta.refetch()} />
      </div>
    )
  }
  return (
    <ConversationProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="features" element={<Features />} />
            <Route path="features/:id" element={<FeatureDetail />} />
            <Route path="retention" element={<Retention />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="assistant" element={<Assistant />} />
            <Route path="recommendations" element={<Recommendations />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConversationProvider>
  )
}
