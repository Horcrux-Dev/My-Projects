import type { Instrument } from './types'

// ============================================================================
// Contract specs for the four instruments this system is tuned for.
// Values reflect standard CME/COMEX contract sizes.
// ============================================================================

export const INSTRUMENTS: Instrument[] = [
  {
    symbol: 'GC',
    name: 'Gold',
    klass: 'Metal',
    tickSize: 0.1,
    tickValue: 10, // $10 per 0.1 move (100 oz contract)
    pointValue: 100, // $100 per $1.00 move
    refPrice: 2380,
    annualVol: 0.15,
    precision: 1,
    micro: { symbol: 'MGC', pointValue: 10, tickValue: 1 },
  },
  {
    symbol: 'NQ',
    name: 'NASDAQ-100',
    klass: 'Index',
    tickSize: 0.25,
    tickValue: 5, // $5 per 0.25 move
    pointValue: 20, // $20 per 1.00 point
    refPrice: 19850,
    annualVol: 0.22,
    precision: 2,
    micro: { symbol: 'MNQ', pointValue: 2, tickValue: 0.5 },
  },
  {
    symbol: 'ES',
    name: 'S&P 500',
    klass: 'Index',
    tickSize: 0.25,
    tickValue: 12.5, // $12.50 per 0.25 move
    pointValue: 50, // $50 per 1.00 point
    refPrice: 5560,
    annualVol: 0.17,
    precision: 2,
    micro: { symbol: 'MES', pointValue: 5, tickValue: 1.25 },
  },
  {
    symbol: 'SI',
    name: 'Silver',
    klass: 'Metal',
    tickSize: 0.005,
    tickValue: 25, // $25 per 0.005 move (5000 oz contract)
    pointValue: 5000, // $5000 per $1.00 move
    refPrice: 30.5,
    annualVol: 0.28,
    precision: 3,
    micro: { symbol: 'SIL', pointValue: 1000, tickValue: 5 },
  },
]

export function getInstrument(symbol: string): Instrument {
  const found = INSTRUMENTS.find((i) => i.symbol === symbol)
  if (!found) throw new Error(`Unknown instrument: ${symbol}`)
  return found
}

/** Round a price to the instrument's tick grid. */
export function roundToTick(price: number, inst: Instrument): number {
  const n = Math.round(price / inst.tickSize) * inst.tickSize
  return Number(n.toFixed(inst.precision))
}

/** Format a price for display at the instrument's precision. */
export function fmtPrice(price: number, inst: Instrument): string {
  return price.toLocaleString('en-US', {
    minimumFractionDigits: inst.precision,
    maximumFractionDigits: inst.precision,
  })
}
