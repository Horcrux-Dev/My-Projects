import type { Candle, Timeframe } from './types'
import type { MarketDataProvider } from './marketData'

// ============================================================================
// Live data adapter (OPTIONAL).
//
// The app runs entirely on the built-in simulator by default. To trade real
// markets, implement `MarketDataProvider` against your data vendor / broker
// and pass it to the pipeline instead of `SimulatedProvider`.
//
// Below is a generic REST example. It expects a JSON endpoint that returns an
// array of OHLCV bars. Point it at your vendor (Databento, Polygon, Tradovate,
// Rithmic bridge, Interactive Brokers gateway, etc.) by setting VITE_DATA_URL
// and mapping that vendor's field names in `mapBar`.
//
//   const provider = new LiveHttpProvider(import.meta.env.VITE_DATA_URL)
//   const out = await runPipeline('GC', provider, account)
//
// A vendor symbol map handles the fact that "GC" may be "GC1!", "GCG5", etc.
// ============================================================================

/** Map an internal timeframe to a vendor resolution string. Adjust per vendor. */
const RESOLUTION: Record<Timeframe, string> = {
  M15: '15m',
  H1: '1h',
  H4: '4h',
  D1: '1d',
}

/** Map internal roots to your vendor's continuous-contract symbols. */
export const DEFAULT_SYMBOL_MAP: Record<string, string> = {
  GC: 'GC1!',
  NQ: 'NQ1!',
  ES: 'ES1!',
  SI: 'SI1!',
}

export class LiveHttpProvider implements MarketDataProvider {
  constructor(
    private baseUrl: string,
    private symbolMap: Record<string, string> = DEFAULT_SYMBOL_MAP,
    private apiKey?: string,
  ) {}

  async getCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const vendorSymbol = this.symbolMap[symbol] ?? symbol
    const url = new URL(this.baseUrl)
    url.searchParams.set('symbol', vendorSymbol)
    url.searchParams.set('resolution', RESOLUTION[timeframe])
    url.searchParams.set('limit', String(limit))

    const res = await fetch(url.toString(), {
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
    })
    if (!res.ok) throw new Error(`Data provider error ${res.status} for ${vendorSymbol}`)
    const raw = (await res.json()) as unknown

    const rows = Array.isArray(raw) ? raw : ((raw as { bars?: unknown[] }).bars ?? [])
    return (rows as Record<string, number>[]).map(mapBar).slice(-limit)
  }
}

/**
 * Normalise one vendor bar into our Candle. Edit the field names to match the
 * shape your vendor returns. This default handles the common
 * {t/o/h/l/c/v} and {time/open/high/low/close/volume} conventions.
 */
function mapBar(b: Record<string, number>): Candle {
  return {
    time: Number(b.t ?? b.time ?? b.timestamp ?? 0),
    open: Number(b.o ?? b.open),
    high: Number(b.h ?? b.high),
    low: Number(b.l ?? b.low),
    close: Number(b.c ?? b.close),
    volume: Number(b.v ?? b.volume ?? 0),
  }
}
