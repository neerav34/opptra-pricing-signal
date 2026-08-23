import type { BuyBoxStatus, Sku } from '../data/skus'

type SkuField = keyof Sku

const HEADER_ALIASES: Record<string, SkuField> = {
  sku: 'id',
  skuid: 'id',
  id: 'id',
  brand: 'brand',
  marketplace: 'marketplace',
  ourprice: 'ourPrice',
  price: 'ourPrice',
  competitor: 'competitorPrice',
  competitorprice: 'competitorPrice',
  buybox: 'buyBox',
  status: 'buyBox',
  marginfloor: 'marginFloor',
  floor: 'marginFloor',
  lastchanged: 'lastChanged',
  changed: 'lastChanged',
}

const REQUIRED_FIELDS: SkuField[] = ['id', 'ourPrice', 'competitorPrice', 'buyBox', 'marginFloor']

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/rs\.?/i, '').split('(')[0].replace(/,/g, '').trim()
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseBuyBox(raw: string): BuyBoxStatus | null {
  const v = raw.trim().toLowerCase()
  if (v.startsWith('won')) return 'Won'
  if (v.startsWith('lost')) return 'Lost'
  return null
}

export interface ParsedCsvResult {
  skus: Sku[]
  errors: string[]
}

// Best-effort CSV parser for the SKU schema. Deliberately simple — no quoted-field
// support — this is a prototype input path, not a general CSV library.
export function parseSkuCsv(text: string): ParsedCsvResult {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) {
    return { skus: [], errors: ['CSV needs a header row plus at least one data row.'] }
  }

  const headerCells = lines[0].split(',').map(normalizeHeader)
  const fieldByColumn: (SkuField | null)[] = headerCells.map(h => HEADER_ALIASES[h] ?? null)

  const missing = REQUIRED_FIELDS.filter(f => !fieldByColumn.includes(f))
  if (missing.length > 0) {
    return { skus: [], errors: [`Missing required column(s): ${missing.join(', ')}`] }
  }

  const skus: Sku[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim())
    const rowNum = i + 1
    const record: Partial<Sku> = {}

    fieldByColumn.forEach((field, col) => {
      if (!field) return
      const raw = cells[col] ?? ''
      if (field === 'ourPrice' || field === 'competitorPrice' || field === 'marginFloor') {
        const n = parseMoney(raw)
        if (n !== null) record[field] = n
      } else if (field === 'buyBox') {
        const b = parseBuyBox(raw)
        if (b) record.buyBox = b
      } else {
        record[field] = raw
      }
    })

    const rowMissing = REQUIRED_FIELDS.filter(f => record[f] === undefined || record[f] === '')
    if (rowMissing.length > 0) {
      errors.push(`Row ${rowNum}: couldn't read ${rowMissing.join(', ')} — skipped.`)
      continue
    }

    skus.push({
      id: String(record.id),
      brand: record.brand ? String(record.brand) : 'Unknown',
      marketplace: record.marketplace ? String(record.marketplace) : '—',
      ourPrice: record.ourPrice as number,
      competitorPrice: record.competitorPrice as number,
      buyBox: record.buyBox as BuyBoxStatus,
      marginFloor: record.marginFloor as number,
      lastChanged: record.lastChanged ? String(record.lastChanged) : '—',
    })
  }

  if (skus.length === 0 && errors.length === 0) {
    errors.push('No data rows found.')
  }

  return { skus, errors }
}
