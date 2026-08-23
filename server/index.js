import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 8787
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

function round(n) {
  return Math.round(n)
}

// Undercutting by Rs.1 isn't a defensible price move — a competitor's own
// repricing bot would immediately re-undercut it. Require a gap big enough to
// actually hold, scaled to the SKU's price so it's sane at any price point.
function minGap(referencePrice) {
  return Math.max(5, Math.round(referencePrice * 0.005))
}

function ruleBasedPrice(sku) {
  const { ourPrice, competitorPrice, marginFloor, bucket } = sku

  if (bucket === 'fix-now') {
    const undercut = Math.max(minGap(competitorPrice), round((competitorPrice - marginFloor) * 0.1))
    let price = competitorPrice - undercut
    price = Math.max(price, marginFloor + 1)
    price = Math.min(price, competitorPrice - 1)
    return price
  }

  if (bucket === 'raise-price') {
    const headroom = competitorPrice - ourPrice
    let price = round(ourPrice + headroom * 0.5)
    price = Math.min(price, competitorPrice - minGap(competitorPrice))
    price = Math.max(price, ourPrice + minGap(ourPrice))
    return price
  }

  return null
}

// The sentence is always built here, never trusted from the LLM verbatim —
// this guarantees the margin-floor number, the gap, and the Rs. formatting
// are present and correct every time, regardless of what the model writes.
function buildSentence(sku, price, reason) {
  const { id, bucket, ourPrice, competitorPrice, marginFloor } = sku
  const marginPct = ((price - marginFloor) / price) * 100
  const cleanReason = reason?.trim().replace(/\.$/, '')
  const tail = cleanReason ? ` ${cleanReason.charAt(0).toUpperCase()}${cleanReason.slice(1)}.` : ''

  if (bucket === 'fix-now') {
    const sentence = `Set ${id} to Rs.${price} — Rs.${competitorPrice - price} below competitor, Rs.${price - marginFloor} above margin floor. Recovers Buy Box at ${marginPct.toFixed(1)}% margin.${tail}`
    return { marginPct, sentence }
  }

  if (bucket === 'raise-price') {
    const sentence = `Raise ${id} to Rs.${price} — captures Rs.${price - ourPrice} of the Rs.${competitorPrice - ourPrice} gap to the competitor while staying Rs.${competitorPrice - price} under them. Improves margin to ${marginPct.toFixed(1)}% without risking the Buy Box.${tail}`
    return { marginPct, sentence }
  }

  return { marginPct, sentence: '' }
}

function ruleBasedRecommendation(sku) {
  const price = ruleBasedPrice(sku)
  return { price, ...buildSentence(sku, price, null) }
}

// A price can sit between the floor and the competitor and still be a weak
// recommendation — e.g. a Rs.1 undercut. Reject anything that doesn't clear a
// sane minimum gap on both sides, not just the raw floor/competitor bounds.
function isDefensiblePrice(sku, price) {
  if (typeof price !== 'number' || Number.isNaN(price)) return false
  if (price <= sku.marginFloor) return false

  if (sku.bucket === 'fix-now') {
    return price < sku.competitorPrice && sku.competitorPrice - price >= minGap(sku.competitorPrice)
  }
  if (sku.bucket === 'raise-price') {
    return (
      price > sku.ourPrice &&
      price < sku.competitorPrice &&
      price - sku.ourPrice >= minGap(sku.ourPrice) &&
      sku.competitorPrice - price >= minGap(sku.competitorPrice)
    )
  }
  return false
}

async function callGroq(skus) {
  const prompt = `You are a pricing recommendation engine for an e-commerce reseller competing for the "Buy Box" on marketplaces like Amazon and Noon.

For each SKU below, recommend ONE specific new price, plus an optional short clause (a few words, no full sentence) giving a case-specific reason beyond the raw numbers — e.g. referencing how long the price has been stale, or how aggressive the competitor's move was.

HARD CONSTRAINT: the recommended price must ALWAYS be strictly greater than that SKU's marginFloor. A price at or below marginFloor is an invalid answer and will be rejected.

Rules per bucket:
- "fix-now" (we lost the Buy Box): recommend a price below the competitor's price (to win the Buy Box back) but above marginFloor. The gap below the competitor must be a defensible, holdable undercut (at least roughly 0.5% of the competitor's price) — not a token Rs.1 difference that invites an immediate re-undercut.
- "raise-price" (we won the Buy Box with room to spare): recommend a price higher than our current price but still meaningfully below the competitor's price (to protect the Buy Box), capturing a real share of that headroom as margin — not a token Rs.1 increase.

SKUs:
${JSON.stringify(skus.map(s => ({ id: s.id, bucket: s.bucket, ourPrice: s.ourPrice, competitorPrice: s.competitorPrice, marginFloor: s.marginFloor, lastChanged: s.lastChanged })), null, 2)}

Respond with ONLY a JSON object of this exact shape, no markdown, no commentary:
{"recommendations": [{"id": "SKU-001", "price": 1189, "reason": "price has been stale for 3 days"}]}`

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
      if (llm && isDefensiblePrice(sku, llm.price)) {
        const { marginPct, sentence } = buildSentence(sku, llm.price, llm.reason)
        return { id: sku.id, price: llm.price, marginPct, sentence, source: 'llm' }
      }
      // LLM omitted this SKU, violated the margin floor, or picked an
      // indefensibly thin gap — fall back to the deterministic price instead
      // of surfacing a bad recommendation to a pricing manager.
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
