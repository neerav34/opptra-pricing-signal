import type { TriagedSku } from './triage'

export type RecommendationSource = 'llm' | 'llm-adjusted' | 'fallback'

export interface Recommendation {
  id: string
  price: number
  marginPct: number
  sentence: string
  source: RecommendationSource
}

export async function fetchRecommendations(skus: TriagedSku[]): Promise<Recommendation[]> {
  const res = await fetch('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skus }),
  })

  if (!res.ok) {
    throw new Error(`Recommendation request failed: ${res.status}`)
  }

  const data = await res.json()
  return data.recommendations as Recommendation[]
}
