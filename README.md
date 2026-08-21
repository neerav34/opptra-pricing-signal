# Pricing Signal

A decision tool for Opptra's Category Operations team — not a dashboard. It takes a
9am pricing snapshot, triages every SKU into "needs a decision now" vs "leave alone",
generates a specific AI-written price recommendation for each actionable SKU
(constrained so it can never violate the margin floor), and lets you apply it with
one click.

## Run it locally

1. `npm install`
2. (Optional) `cp .env.example .env` and add a free [Groq](https://console.groq.com/keys)
   API key to `GROQ_API_KEY`. Without a key, the app runs fully offline using a
   deterministic rule-based recommender — same output format, no LLM call.
3. `npm run dev` — opens the client on [http://localhost:5173](http://localhost:5173)
   (the API proxy runs alongside it on port 8787).

## How it's built

- **Frontend**: React + TypeScript + Vite + Tailwind. All 8 SKUs from the case
  study are hardcoded in [`src/data/skus.ts`](src/data/skus.ts).
- **Triage logic** ([`src/lib/triage.ts`](src/lib/triage.ts)): plain, deterministic
  code — not the LLM — decides which of 4 buckets a SKU falls into. This is
  intentional: bucketing is a business rule, not a judgment call, so it should be
  cheap, instant, and testable without an API call.
- **AI layer** ([`server/index.js`](server/index.js)): a thin Express proxy calls
  Groq's free, OpenAI-compatible chat completions API (`llama-3.3-70b-versatile`)
  with the actionable SKUs and asks for a specific price + one-sentence
  recommendation per SKU. The server validates every price against that SKU's
  margin floor before it reaches the UI — if the model returns a price at or below
  the floor (or outside the sane range for its bucket), the server silently
  substitutes a rule-based recommendation instead and labels the card
  "AI, floor-corrected" rather than showing a broken recommendation.
- **Why a server at all**: an Anthropic/Groq key can't safely live in a browser
  bundle. The server is ~120 lines and does exactly one thing — proxy the LLM call
  and enforce the margin-floor constraint. Everything else is static frontend with
  hardcoded data, per the brief's own guidance.

## What's cut (would add with another 4 hours)

- CSV upload / paste-to-ingest — hardcoded data was the explicit hint in the brief,
  and the shape of the ingestion problem doesn't change once you have 8 rows vs. 800.
  Would add: a CSV parser + Zod schema validation.
- Persisting "Applied" state past a page refresh (currently in-memory only) — no
  backend datastore in scope for this prototype.
- Undo on a mis-click Apply.
- Per-marketplace grouping/filtering once SKU count grows past a triage view's limit.
