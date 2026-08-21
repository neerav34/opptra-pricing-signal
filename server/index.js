import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 8787
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

function round(n) {
  return Math.round(n)
}

// Deterministic template used both as the no-key fallback and as the safety
// net when the LLM violates the margin floor constraint.
function ruleBasedRecommendation(sku) {
  const { id, bucket, ourPrice, competitorPrice, marginFloor } = sku

  if (bucket === 'fix-now') {
    const undercut = round(Math.min(10, (competitorPrice - marginFloor) * 0.1) || 1)
    let price = competitorPrice - undercut
    price = Math.max(price, marginFloor + 1)
    price = Math.min(price, competitorPrice - 1)
    const marginPct = ((price - marginFloor) / price) * 100
    const sentence = `Set ${id} to Rs.${price} — Rs.${competitorPrice - price} below competitor, Rs.${price - marginFloor} above margin floor. Recovers Buy Box at ${marginPct.toFixed(1)}% margin.`
    return { price, marginPct, sentence }
  }

  if (bucket === 'raise-price') {
    const headroom = competitorPrice - ourPrice
    let price = round(ourPrice + headroom * 0.5)
    price = Math.min(price, competitorPrice - 1)
    price = Math.max(price, ourPrice + 1)
    const marginPct = ((price - marginFloor) / price) * 100
    const sentence = `Raise ${id} to Rs.${price} — captures Rs.${price - ourPrice} of the Rs.${headroom} gap to the competitor while staying Rs.${competitorPrice - price} under them. Improves margin to ${marginPct.toFixed(1)}% without risking the Buy Box.`
    return { price, marginPct, sentence }
  }

  return null
}

function isWithinConstraint(sku, price) {
  if (typeof price !== 'number' || Number.isNaN(price)) return false
  if (price <= sku.marginFloor) return false
  if (sku.bucket === 'fix-now') return price < sku.competitorPrice
  if (sku.bucket === 'raise-price') return price > sku.ourPrice && price < sku.competitorPrice
  return false
}

async function callGroq(skus) {
  const prompt = `You are a pricing recommendation engine for an e-commerce reseller competing for the "Buy Box" on marketplaces like Amazon and Noon.

For each SKU below, recommend ONE specific new price and a one-sentence, decision-ready recommendation a pricing manager can act on immediately.

HARD CONSTRAINT: the recommended price must ALWAYS be strictly greater than that SKU's marginFloor. A price at or below marginFloor is an invalid answer and will be rejected.

Rules per bucket:
- "fix-now" (we lost the Buy Box): recommend a price below the competitor's price (to win the Buy Box back) but above marginFloor. Prefer a small, defensible undercut rather than a large one.
- "raise-price" (we won the Buy Box with room to spare): recommend a price higher than our current price but still below the competitor's price (to protect the Buy Box), capturing some of that headroom as margin.

SKUs:
${JSON.stringify(skus.map(s => ({ id: s.id, bucket: s.bucket, ourPrice: s.ourPrice, competitorPrice: s.competitorPrice, marginFloor: s.marginFloor })), null, 2)}

Respond with ONLY a JSON object of this exact shape, no markdown, no commentary:
{"recommendations": [{"id": "SKU-001", "price": 1189, "sentence": "Set SKU-001 to Rs.1189 — Rs.10 below competitor, Rs.139 above margin floor. Recovers Buy Box at 8.4% margin."}]}`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Groq API error ${res.status}: ${body}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  const parsed = JSON.parse(content)
  return parsed.recommendations || []
}

app.post('/api/recommend', async (req, res) => {
  const skus = req.body.skus || []
  const actionable = skus.filter(s => s.bucket === 'fix-now' || s.bucket === 'raise-price')

  if (actionable.length === 0) {
    return res.json({ recommendations: [] })
  }

  if (!GROQ_API_KEY) {
    const recommendations = actionable.map(sku => ({
      id: sku.id,
      source: 'fallback',
      ...ruleBasedRecommendation(sku),
    }))
    return res.json({ recommendations })
  }

  try {
    const llmResults = await callGroq(actionable)
    const byId = new Map(llmResults.map(r => [r.id, r]))

    const recommendations = actionable.map(sku => {
      const llm = byId.get(sku.id)
      if (llm && isWithinConstraint(sku, llm.price)) {
        const marginPct = ((llm.price - sku.marginFloor) / llm.price) * 100
        return { id: sku.id, price: llm.price, marginPct, sentence: llm.sentence, source: 'llm' }
      }
      // LLM omitted this SKU or violated the margin floor — fall back to the
      // deterministic, constraint-safe recommendation instead of surfacing a
      // bad price to a pricing manager.
      return {
        id: sku.id,
        source: llm ? 'llm-adjusted' : 'fallback',
        ...ruleBasedRecommendation(sku),
      }
    })

    return res.json({ recommendations })
  } catch (err) {
    console.error('Groq call failed, using fallback:', err.message)
    const recommendations = actionable.map(sku => ({
      id: sku.id,
      source: 'fallback',
      ...ruleBasedRecommendation(sku),
    }))
    return res.json({ recommendations })
  }
})

app.listen(PORT, () => {
  console.log(`Pricing signal API listening on http://localhost:${PORT}`)
  console.log(GROQ_API_KEY ? `Using live Groq model: ${GROQ_MODEL}` : 'No GROQ_API_KEY set — serving rule-based fallback recommendations')
})
