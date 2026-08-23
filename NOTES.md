# Design note

The hardest call was what counts as "needs a decision." It would've been easy to
show all 8 SKUs with an AI blurb each — technically complete, but that's the
spreadsheet-with-extra-steps Ranjit explicitly said he didn't want. Instead the
triage logic actively hides two SKUs (won, but the competitor gap is under 10%/Rs.100)
in a collapsed "Stable" section by default. Fewer visible cards, more signal per
card. With another 4 hours I'd add a per-brand or per-marketplace rollup above the
triage board (e.g. "LivSpace Pro: 2 SKUs need action") so Ranjit can jump straight
to the brand he's currently worried about instead of scanning the whole board.

# Edge case handling

**SKU-007 (competitor below margin floor):** handled as its own triage bucket
(`floor-blocked`), computed before any AI call is made — there's no LLM round-trip
for this SKU at all, since there's no valid recommendation to generate. The UI
shows a static, clearly-worded flag ("no profitable action available... this is a
Buy Box loss to accept, not fix") instead of a greyed-out or missing card, so it
reads as "seen and triaged," not "broken."

**LLM violates the margin floor anyway:** the server treats every LLM-returned
price as untrusted input. If the returned price is at/below the floor, or outside
the sane bound for its bucket (a "fix-now" price above the competitor's, a
"raise-price" price above the competitor's), the server discards it and
substitutes the same deterministic formula used in fully-offline mode — then
labels the card "AI, floor-corrected" rather than silently swapping the number.
Ranjit shouldn't have to trust the AI's math on a margin-critical number; the
constraint is enforced in code, not in the prompt.

**No Groq key present / Groq API errors:** falls back to the same deterministic
recommender, labeled "Offline rule engine." The app is fully demoable with zero
external dependencies.

**Malformed CSV upload:** header matching is alias-based (accepts "SKU"/"ID",
"Buy Box"/"Status", etc.) so minor header variance doesn't break ingestion. A row
missing a required field is skipped individually with a row number in the notice
banner, rather than rejecting the whole file over one bad row.
