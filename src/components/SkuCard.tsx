import { useState } from 'react'
import type { TriagedSku } from '../lib/triage'
import type { Recommendation } from '../lib/recommend'

const SOURCE_LABEL: Record<Recommendation['source'], string> = {
  llm: 'Live AI',
  'llm-adjusted': 'AI, floor-corrected',
  fallback: 'Offline rule engine',
}

const SOURCE_STYLE: Record<Recommendation['source'], string> = {
  llm: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  'llm-adjusted': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  fallback: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
}

function money(n: number) {
  return `Rs.${n.toLocaleString('en-IN')}`
}

interface Props {
  sku: TriagedSku
  recommendation: Recommendation | null
  loading: boolean
}

export function SkuCard({ sku, recommendation, loading }: Props) {
  const [applied, setApplied] = useState<number | null>(null)

  const isBlocked = sku.bucket === 'floor-blocked'
  const isStable = sku.bucket === 'stable'

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-100">{sku.id}</div>
          <div className="text-sm text-slate-400">{sku.brand} · {sku.marketplace}</div>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full border shrink-0 ${
            sku.buyBox === 'Won'
              ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
          }`}
        >
          Buy Box {sku.buyBox}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-slate-500">Our price</div>
          <div className="text-slate-200 font-medium">{money(sku.ourPrice)}</div>
        </div>
        <div>
          <div className="text-slate-500">Competitor</div>
          <div className="text-slate-200 font-medium">{money(sku.competitorPrice)}</div>
        </div>
        <div>
          <div className="text-slate-500">Margin floor</div>
          <div className="text-slate-200 font-medium">{money(sku.marginFloor)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-500">Last changed {sku.lastChanged}</div>

      {isBlocked && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-200">
          Competitor price ({money(sku.competitorPrice)}) is below your margin floor ({money(sku.marginFloor)}).
          Matching it would sell at a loss — no profitable action available. Hold price and monitor; this is a
          Buy Box loss to accept, not fix.
        </div>
      )}

      {isStable && (
        <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3 text-sm text-slate-400">
          Winning the Buy Box with only a small gap to the competitor. Not worth touching right now.
        </div>
      )}

      {!isBlocked && !isStable && (
        <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3 flex flex-col gap-2">
          {loading && (
            <div className="text-sm text-slate-500 animate-pulse">Generating recommendation…</div>
          )}
          {!loading && recommendation && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${SOURCE_STYLE[recommendation.source]}`}>
                  {SOURCE_LABEL[recommendation.source]}
                </span>
                <span className="text-xs text-slate-500">{recommendation.marginPct.toFixed(1)}% margin</span>
              </div>
              <p className="text-sm text-slate-200 leading-snug">{recommendation.sentence}</p>
              {applied === null ? (
                <button
                  onClick={() => setApplied(recommendation.price)}
                  className="mt-1 w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2 transition-colors"
                >
                  Apply — reprice to {money(recommendation.price)}
                </button>
              ) : (
                <div className="mt-1 w-full rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-sm font-medium py-2 text-center">
                  ✓ Repriced to {money(applied)}
                </div>
              )}
            </>
          )}
          {!loading && !recommendation && (
            <div className="text-sm text-rose-400">Couldn't generate a recommendation.</div>
          )}
        </div>
      )}
    </div>
  )
}
