import { useState } from 'react'
import type { TriagedSku, TriageBucket } from '../lib/triage'
import type { Recommendation } from '../lib/recommend'
import { SkuCard } from './SkuCard'

interface SectionDef {
  bucket: TriageBucket
  title: string
  description: string
  accent: string
  defaultOpen: boolean
}

const SECTIONS: SectionDef[] = [
  {
    bucket: 'fix-now',
    title: 'Fix now',
    description: 'Losing the Buy Box, and a profitable price drop exists',
    accent: 'border-l-rose-500',
    defaultOpen: true,
  },
  {
    bucket: 'raise-price',
    title: 'Raise price',
    description: 'Winning the Buy Box with real headroom to spare',
    accent: 'border-l-emerald-500',
    defaultOpen: true,
  },
  {
    bucket: 'floor-blocked',
    title: 'Blocked by margin floor',
    description: 'Competitor is pricing below what you can profitably match',
    accent: 'border-l-amber-500',
    defaultOpen: true,
  },
  {
    bucket: 'stable',
    title: 'Stable',
    description: 'Winning, no meaningful headroom — no action needed',
    accent: 'border-l-slate-600',
    defaultOpen: false,
  },
]

interface Props {
  skus: TriagedSku[]
  recommendations: Map<string, Recommendation>
  loading: boolean
}

export function TriageBoard({ skus, recommendations, loading }: Props) {
  const [open, setOpen] = useState<Record<TriageBucket, boolean>>(
    Object.fromEntries(SECTIONS.map(s => [s.bucket, s.defaultOpen])) as Record<TriageBucket, boolean>,
  )

  return (
    <div className="flex flex-col gap-6">
      {SECTIONS.map(section => {
        const items = skus.filter(s => s.bucket === section.bucket)
        if (items.length === 0) return null
        const isOpen = open[section.bucket]

        return (
          <div key={section.bucket} className={`border-l-4 ${section.accent} pl-4`}>
            <button
              className="flex items-baseline gap-3 w-full text-left"
              onClick={() => setOpen(o => ({ ...o, [section.bucket]: !o[section.bucket] }))}
            >
              <h2 className="text-lg font-semibold text-slate-100">{section.title}</h2>
              <span className="text-sm text-slate-500">{section.description}</span>
              <span className="ml-auto text-xs text-slate-500 rounded-full bg-slate-800 px-2 py-0.5">
                {items.length}
              </span>
              <span className="text-slate-500 text-sm">{isOpen ? '▾' : '▸'}</span>
            </button>

            {isOpen && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
                {items.map(sku => (
                  <SkuCard
                    key={sku.id}
                    sku={sku}
                    recommendation={recommendations.get(sku.id) ?? null}
                    loading={loading && (sku.bucket === 'fix-now' || sku.bucket === 'raise-price')}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
