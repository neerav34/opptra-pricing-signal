import type { Sku } from '../data/skus'

export type TriageBucket = 'fix-now' | 'raise-price' | 'floor-blocked' | 'stable'

export interface TriagedSku extends Sku {
  bucket: TriageBucket
  headroom: number
  headroomPct: number
}

// Won SKUs only surface as a "raise price" opportunity once the gap to the
// competitor is big enough to be worth the risk of losing the Buy Box.
const RAISE_PRICE_MIN_HEADROOM_PCT = 0.1
const RAISE_PRICE_MIN_HEADROOM_ABS = 100

export function triage(sku: Sku): TriagedSku {
  const headroom = sku.competitorPrice - sku.ourPrice
  const headroomPct = headroom / sku.ourPrice

  let bucket: TriageBucket

  if (sku.buyBox === 'Lost') {
    bucket = sku.competitorPrice < sku.marginFloor ? 'floor-blocked' : 'fix-now'
  } else {
    const hasHeadroom = headroomPct >= RAISE_PRICE_MIN_HEADROOM_PCT || headroom >= RAISE_PRICE_MIN_HEADROOM_ABS
    bucket = hasHeadroom ? 'raise-price' : 'stable'
  }

  return { ...sku, bucket, headroom, headroomPct }
}

export function triageAll(skus: Sku[]): TriagedSku[] {
  return skus.map(triage)
}

export const BUCKET_LABELS: Record<TriageBucket, string> = {
  'fix-now': 'Losing Buy Box — fixable within margin',
  'raise-price': 'Winning with room to raise',
  'floor-blocked': 'Blocked — competitor below margin floor',
  stable: 'Stable — no action needed',
}
