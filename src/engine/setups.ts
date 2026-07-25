import type { Candle, Direction, ScanResult, SetupType } from './types'
import { adx, atr, closes, ema, lastDefined, macd, rsi, swings } from './indicators'

// ============================================================================
// SIGNAL ENGINE · DETECT + SCORE (reference page 3).
// Classifies the market into one of five high-probability setup archetypes:
//   BREAKOUT · PULLBACK · MOMENTUM · TREND CONTINUATION · REVERSAL
// Each candidate is scored 0..100; the highest-quality candidate wins.
// ============================================================================

export interface SetupMatch {
  type: SetupType
  direction: Direction
  quality: number
  note: string
}

export function detectSetup(candles: Candle[], scan: ScanResult): SetupMatch {
  const c = closes(candles)
  const n = candles.length
  const price = c[n - 1]
  const atrVal = lastDefined(atr(candles, 14)) || price * 0.005
  const ema20 = lastDefined(ema(c, 20))
  const ema50 = lastDefined(ema(c, 50))
  const r = rsi(c, 14)
  const rNow = lastDefined(r)
  const rPrev = r[n - 2] ?? rNow
  const m = macd(c)
  const hist = m.histogram
  const h0 = hist[n - 1] ?? 0
  const h1 = hist[n - 2] ?? 0
  const h2 = hist[n - 3] ?? 0
  const adxRes = adx(candles, 14)
  const adxNow = lastDefined(adxRes.adx)
  const adxPrev = adxRes.adx[n - 6] ?? adxNow
  const body = Math.abs(candles[n - 1].close - candles[n - 1].open)
  const trendUp = scan.htfTrend === 'LONG'
  const trendDn = scan.htfTrend === 'SHORT'

  // Donchian channel over the prior 20 bars (excluding the current one).
  const look = 20
  const priorHigh = Math.max(...candles.slice(n - 1 - look, n - 1).map((x) => x.high))
  const priorLow = Math.min(...candles.slice(n - 1 - look, n - 1).map((x) => x.low))

  const candidates: SetupMatch[] = []

  // --- BREAKOUT: close pierces the prior range, ideally on expansion --------
  if (price > priorHigh || price < priorLow) {
    const up = price > priorHigh
    let q = 55
    if (body > atrVal) q += 15
    if (scan.volumePct > 120) q += 15
    if (up === trendUp || (!up && trendDn)) q += 10 // break with the trend
    candidates.push({
      type: 'BREAKOUT',
      direction: up ? 'LONG' : 'SHORT',
      quality: clamp(q),
      note: `Price broke ${up ? 'above' : 'below'} the ${look}-bar range${scan.volumePct > 120 ? ' on rising volume' : ''}`,
    })
  }

  // --- MOMENTUM: MACD histogram accelerating + ADX rising + big candle ------
  {
    const accelUp = h0 > h1 && h1 > h2 && h0 > 0
    const accelDn = h0 < h1 && h1 < h2 && h0 < 0
    if ((accelUp || accelDn) && adxNow > adxPrev) {
      let q = 50 + Math.min(20, Math.abs(h0 - h2) / (atrVal || 1) * 40)
      if (body > atrVal * 1.2) q += 15
      if (adxNow > 25) q += 10
      candidates.push({
        type: 'MOMENTUM',
        direction: accelUp ? 'LONG' : 'SHORT',
        quality: clamp(q),
        note: `${accelUp ? 'Bullish' : 'Bearish'} momentum accelerating (MACD ↑, ADX ${adxNow.toFixed(0)})`,
      })
    }
  }

  // --- PULLBACK: established trend, price pulled back to value, turning ------
  {
    const nearEma = Math.abs(price - ema20) < atrVal * 0.8 || Math.abs(price - ema50) < atrVal * 0.8
    if (trendUp && nearEma && rNow > rPrev && rNow < 60 && adxNow >= 18) {
      candidates.push({
        type: 'PULLBACK',
        direction: 'LONG',
        quality: clamp(60 + (60 - rNow) * 0.5 + (adxNow - 18)),
        note: `Uptrend pullback to value (RSI ${rNow.toFixed(0)} turning up near EMA)`,
      })
    } else if (trendDn && nearEma && rNow < rPrev && rNow > 40 && adxNow >= 18) {
      candidates.push({
        type: 'PULLBACK',
        direction: 'SHORT',
        quality: clamp(60 + (rNow - 40) * 0.5 + (adxNow - 18)),
        note: `Downtrend pullback to value (RSI ${rNow.toFixed(0)} rolling over near EMA)`,
      })
    }
  }

  // --- TREND CONTINUATION: strong stacked trend, structure intact -----------
  {
    const stackUp = price > ema20 && ema20 > ema50 && adxNow >= 22
    const stackDn = price < ema20 && ema20 < ema50 && adxNow >= 22
    if (stackUp && rNow < 72) {
      candidates.push({
        type: 'CONTINUATION',
        direction: 'LONG',
        quality: clamp(55 + (adxNow - 22)),
        note: `Uptrend intact and extending (EMA stacked, ADX ${adxNow.toFixed(0)})`,
      })
    } else if (stackDn && rNow > 28) {
      candidates.push({
        type: 'CONTINUATION',
        direction: 'SHORT',
        quality: clamp(55 + (adxNow - 22)),
        note: `Downtrend intact and extending (EMA stacked, ADX ${adxNow.toFixed(0)})`,
      })
    }
  }

  // --- REVERSAL: exhaustion at an extreme (counter-trend, handle with care) -
  {
    const { swingHighs, swingLows } = swings(candles, 3)
    if (rNow >= 70 && rNow < rPrev) {
      // Bearish reversal: overbought and rolling over, ideally a lower high.
      const lowerHigh =
        swingHighs.length >= 2 &&
        swingHighs[swingHighs.length - 1].price < swingHighs[swingHighs.length - 2].price
      candidates.push({
        type: 'REVERSAL',
        direction: 'SHORT',
        quality: clamp(45 + (rNow - 70) * 1.5 + (lowerHigh ? 15 : 0)),
        note: `Overbought exhaustion (RSI ${rNow.toFixed(0)}${lowerHigh ? ', lower high' : ''})`,
      })
    } else if (rNow <= 30 && rNow > rPrev) {
      const higherLow =
        swingLows.length >= 2 &&
        swingLows[swingLows.length - 1].price > swingLows[swingLows.length - 2].price
      candidates.push({
        type: 'REVERSAL',
        direction: 'LONG',
        quality: clamp(45 + (30 - rNow) * 1.5 + (higherLow ? 15 : 0)),
        note: `Oversold exhaustion (RSI ${rNow.toFixed(0)}${higherLow ? ', higher low' : ''})`,
      })
    }
  }

  if (candidates.length === 0) {
    return { type: 'NONE', direction: 'FLAT', quality: 0, note: 'No high-probability pattern flagged' }
  }
  // Highest-quality candidate wins; counter-trend reversals are slightly
  // discounted so with-trend setups are preferred on ties.
  candidates.sort((a, b) => adj(b) - adj(a))
  return candidates[0]

  function adj(s: SetupMatch): number {
    if (s.type === 'REVERSAL') return s.quality - 8
    return s.quality
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)))
}

export const SETUP_LABEL: Record<SetupType, string> = {
  BREAKOUT: 'Breakout',
  PULLBACK: 'Pullback',
  MOMENTUM: 'Momentum',
  CONTINUATION: 'Trend Continuation',
  REVERSAL: 'Reversal',
  NONE: 'No Setup',
}
