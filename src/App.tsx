import { useEffect, useMemo, useRef, useState } from 'react'
import { SKUS, type Sku } from './data/skus'
import { triageAll } from './lib/triage'
import { fetchRecommendations, type Recommendation } from './lib/recommend'
import { parseSkuCsv } from './lib/csv'
import { TriageBoard } from './components/TriageBoard'

function App() {
  const [skus, setSkus] = useState<Sku[]>(SKUS)
  const [usingSample, setUsingSample] = useState(true)
  const [csvNotice, setCsvNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const triaged = useMemo(() => triageAll(skus), [skus])
  const [recommendations, setRecommendations] = useState<Map<string, Recommendation>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const needsAction = triaged.filter(s => s.bucket === 'fix-now' || s.bucket === 'raise-price').length
  const blocked = triaged.filter(s => s.bucket === 'floor-blocked').length

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setRecommendations(new Map())
    setError(null)
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

  function handleFile(file: File) {
    file.text().then(text => {
      const { skus: parsed, errors } = parseSkuCsv(text)
      if (parsed.length === 0) {
        setCsvNotice(errors[0] ?? 'Could not parse that file.')
        return
      }
      setSkus(parsed)
      setUsingSample(false)
      setCsvNotice(
        errors.length > 0
          ? `Loaded ${parsed.length} SKUs (${errors.length} row${errors.length === 1 ? '' : 's'} skipped — see below).`
          : `Loaded ${parsed.length} SKUs from file.`,
      )
    })
  }

  function resetToSample() {
    setSkus(SKUS)
    setUsingSample(true)
    setCsvNotice(null)
  }

  return (
    <div className="min-h-screen bg-[#0b0d12]">
      <header className="border-b border-slate-800 px-6 py-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Pricing Signal</h1>
          <p className="text-sm text-slate-500 mt-1">
            {needsAction} SKU{needsAction === 1 ? '' : 's'} need a decision right now
            {blocked > 0 && <> · {blocked} flagged, no action possible</>}
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">{usingSample ? 'Sample data' : `Uploaded · ${skus.length} SKUs`}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-slate-700 hover:border-slate-500 text-slate-200 px-3 py-1.5 transition-colors"
          >
            Upload CSV
          </button>
          {!usingSample && (
            <button onClick={resetToSample} className="text-slate-500 hover:text-slate-300 underline">
              Reset to sample data
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {csvNotice && (
          <div className="mb-4 rounded-lg bg-slate-800/60 border border-slate-700 p-3 text-sm text-slate-300">
            {csvNotice}
          </div>
        )}
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
