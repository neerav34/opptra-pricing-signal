import { useEffect, useMemo, useState } from 'react'
import { SKUS } from './data/skus'
import { triageAll } from './lib/triage'
import { fetchRecommendations, type Recommendation } from './lib/recommend'
import { TriageBoard } from './components/TriageBoard'

function App() {
  const triaged = useMemo(() => triageAll(SKUS), [])
  const [recommendations, setRecommendations] = useState<Map<string, Recommendation>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const needsAction = triaged.filter(s => s.bucket === 'fix-now' || s.bucket === 'raise-price').length
  const blocked = triaged.filter(s => s.bucket === 'floor-blocked').length

  useEffect(() => {
    let cancelled = false
    fetchRecommendations(triaged)
      .then(recs => {
        if (cancelled) return
        setRecommendations(new Map(recs.map(r => [r.id, r])))
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [triaged])

  return (
    <div className="min-h-screen bg-[#0b0d12]">
      <header className="border-b border-slate-800 px-6 py-5">
        <h1 className="text-xl font-semibold text-slate-100">Pricing Signal</h1>
        <p className="text-sm text-slate-500 mt-1">
          {needsAction} SKU{needsAction === 1 ? '' : 's'} need a decision right now
          {blocked > 0 && <> · {blocked} flagged, no action possible</>}
        </p>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-sm text-rose-300">
            Couldn't reach the recommendation engine: {error}
          </div>
        )}
        <TriageBoard skus={triaged} recommendations={recommendations} loading={loading} />
      </main>
    </div>
  )
}

export default App
