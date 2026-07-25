import type { Candle } from './types'

// ============================================================================
// Technical indicator library.
// Pure functions over price series. All return arrays aligned to the input
// (leading values that cannot be computed are NaN) unless noted otherwise.
// ============================================================================

export const closes = (c: Candle[]) => c.map((x) => x.close)
export const highs = (c: Candle[]) => c.map((x) => x.high)
export const lows = (c: Candle[]) => c.map((x) => x.low)

/** Simple moving average. */
export function sma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** Exponential moving average. Seeded with an SMA of the first `period`. */
export function ema(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN)
  const k = 2 / (period + 1)
  let prev = NaN
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue
    if (i === period - 1) {
      let s = 0
      for (let j = 0; j < period; j++) s += values[j]
      prev = s / period
    } else {
      prev = values[i] * k + prev * (1 - k)
    }
    out[i] = prev
  }
  return out
}

/** Wilder's RSI (0..100). */
export function rsi(values: number[], period = 14): number[] {
  const out = new Array(values.length).fill(NaN)
  if (values.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    const g = d > 0 ? d : 0
    const l = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

export interface MacdResult {
  macd: number[]
  signal: number[]
  histogram: number[]
}

/** MACD (fast/slow/signal EMAs). */
export function macd(values: number[], fast = 12, slow = 26, sig = 9): MacdResult {
  const emaFast = ema(values, fast)
  const emaSlow = ema(values, slow)
  const macdLine = values.map((_, i) =>
    isNaN(emaFast[i]) || isNaN(emaSlow[i]) ? NaN : emaFast[i] - emaSlow[i],
  )
  // Signal line is an EMA of the (defined portion of the) MACD line.
  const defined = macdLine.filter((v) => !isNaN(v))
  const sigDefined = ema(defined, sig)
  const signal = new Array(values.length).fill(NaN)
  let firstDefined = macdLine.findIndex((v) => !isNaN(v))
  for (let i = 0; i < sigDefined.length; i++) {
    signal[firstDefined + i] = sigDefined[i]
  }
  const histogram = macdLine.map((v, i) =>
    isNaN(v) || isNaN(signal[i]) ? NaN : v - signal[i],
  )
  return { macd: macdLine, signal, histogram }
}

/** True range series. */
export function trueRange(candles: Candle[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low
    const prevClose = candles[i - 1].close
    return Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose),
    )
  })
}

/** Wilder's Average True Range. */
export function atr(candles: Candle[], period = 14): number[] {
  const tr = trueRange(candles)
  const out = new Array(candles.length).fill(NaN)
  if (candles.length <= period) return out
  let sum = 0
  for (let i = 1; i <= period; i++) sum += tr[i]
  let prev = sum / period
  out[period] = prev
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period
    out[i] = prev
  }
  return out
}

export interface AdxResult {
  adx: number[]
  plusDI: number[]
  minusDI: number[]
}

/** Wilder's ADX with directional indicators. */
export function adx(candles: Candle[], period = 14): AdxResult {
  const n = candles.length
  const plusDM = new Array(n).fill(0)
  const minusDM = new Array(n).fill(0)
  const tr = trueRange(candles)
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high
    const down = candles[i - 1].low - candles[i].low
    plusDM[i] = up > down && up > 0 ? up : 0
    minusDM[i] = down > up && down > 0 ? down : 0
  }
  const smooth = (arr: number[]) => {
    const out = new Array(n).fill(NaN)
    if (n <= period) return out
    let sum = 0
    for (let i = 1; i <= period; i++) sum += arr[i]
    out[period] = sum
    for (let i = period + 1; i < n; i++) {
      out[i] = out[i - 1] - out[i - 1] / period + arr[i]
    }
    return out
  }
  const trS = smooth(tr)
  const plusS = smooth(plusDM)
  const minusS = smooth(minusDM)
  const plusDI = new Array(n).fill(NaN)
  const minusDI = new Array(n).fill(NaN)
  const dx = new Array(n).fill(NaN)
  for (let i = period; i < n; i++) {
    if (!trS[i] || trS[i] === 0) continue
    plusDI[i] = (100 * plusS[i]) / trS[i]
    minusDI[i] = (100 * minusS[i]) / trS[i]
    const sum = plusDI[i] + minusDI[i]
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(plusDI[i] - minusDI[i])) / sum
  }
  const adxArr = new Array(n).fill(NaN)
  const start = period * 2
  if (n > start) {
    let sum = 0
    for (let i = period; i < start; i++) sum += dx[i]
    adxArr[start - 1] = sum / period
    for (let i = start; i < n; i++) {
      adxArr[i] = (adxArr[i - 1] * (period - 1) + dx[i]) / period
    }
  }
  return { adx: adxArr, plusDI, minusDI }
}

export interface StochResult {
  k: number[]
  d: number[]
}

/** Stochastic oscillator (%K / %D). */
export function stochastic(candles: Candle[], period = 14, smoothD = 3): StochResult {
  const n = candles.length
  const k = new Array(n).fill(NaN)
  for (let i = period - 1; i < n; i++) {
    let hh = -Infinity
    let ll = Infinity
    for (let j = i - period + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j].high)
      ll = Math.min(ll, candles[j].low)
    }
    k[i] = hh === ll ? 50 : (100 * (candles[i].close - ll)) / (hh - ll)
  }
  const d = sma(
    k.map((v) => (isNaN(v) ? 0 : v)),
    smoothD,
  ).map((v, i) => (i < period - 1 + smoothD - 1 ? NaN : v))
  return { k, d }
}

export interface BollingerResult {
  upper: number[]
  middle: number[]
  lower: number[]
  bandwidth: number[]
}

/** Bollinger Bands. */
export function bollinger(values: number[], period = 20, mult = 2): BollingerResult {
  const middle = sma(values, period)
  const upper = new Array(values.length).fill(NaN)
  const lower = new Array(values.length).fill(NaN)
  const bandwidth = new Array(values.length).fill(NaN)
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += (values[j] - middle[i]) ** 2
    const sd = Math.sqrt(sum / period)
    upper[i] = middle[i] + mult * sd
    lower[i] = middle[i] - mult * sd
    bandwidth[i] = middle[i] === 0 ? 0 : (upper[i] - lower[i]) / middle[i]
  }
  return { upper, middle, lower, bandwidth }
}

/** Index of the last defined (non-NaN) value in a series. */
export function lastDefined(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) if (!isNaN(arr[i])) return arr[i]
  return NaN
}

/**
 * Swing points via a symmetric fractal of half-width `lookback`.
 * Returns arrays of {index, price}.
 */
export function swings(candles: Candle[], lookback = 3) {
  const swingHighs: { index: number; price: number }[] = []
  const swingLows: { index: number; price: number }[] = []
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true
    let isLow = true
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].high >= candles[i].high) isHigh = false
      if (candles[j].low <= candles[i].low) isLow = false
    }
    if (isHigh) swingHighs.push({ index: i, price: candles[i].high })
    if (isLow) swingLows.push({ index: i, price: candles[i].low })
  }
  return { swingHighs, swingLows }
}

/** Normalised linear-regression slope of the last `period` closes (per-bar %). */
export function slopePct(values: number[], period = 20): number {
  const n = values.length
  if (n < period) return 0
  const seg = values.slice(n - period)
  const xMean = (period - 1) / 2
  const yMean = seg.reduce((a, b) => a + b, 0) / period
  let num = 0
  let den = 0
  for (let i = 0; i < period; i++) {
    num += (i - xMean) * (seg[i] - yMean)
    den += (i - xMean) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  return yMean === 0 ? 0 : (slope / yMean) * 100
}
