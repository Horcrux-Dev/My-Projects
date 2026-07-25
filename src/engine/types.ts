// ============================================================================
// Core domain types for the 24/7 AI Trader decision engine.
// Pipeline: SCAN -> SIGNALS -> PLAN -> RISK -> MONITOR -> VERDICT
// ============================================================================

export type Direction = 'LONG' | 'SHORT' | 'FLAT'

export type Timeframe = 'M15' | 'H1' | 'H4' | 'D1'

/** A single OHLCV candle. `time` is a unix ms timestamp. */
export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** Static contract specification for a futures instrument. */
export interface Instrument {
  /** Root symbol, e.g. "GC". */
  symbol: string
  /** Human name, e.g. "Gold". */
  name: string
  /** Asset class label used in the UI. */
  klass: 'Metal' | 'Index'
  /** Minimum price increment. */
  tickSize: number
  /** Cash value of one tick, in USD. */
  tickValue: number
  /** Cash value of a full 1.0 point move, in USD. */
  pointValue: number
  /** Approximate reference price, used to seed the simulator. */
  refPrice: number
  /** Annualised volatility estimate used by the simulator. */
  annualVol: number
  /** Number of decimal places to render. */
  precision: number
  /** A smaller "micro" sibling contract, if one exists. */
  micro?: {
    symbol: string
    pointValue: number
    tickValue: number
  }
}

/** Result of the SCAN stage for one instrument. */
export interface ScanResult {
  instrument: Instrument
  lastPrice: number
  changePct: number
  /** Average True Range on the entry timeframe. */
  atr: number
  /** ATR as a percentage of price — the volatility read. */
  atrPct: number
  /** ADX strength of the prevailing trend. */
  adx: number
  regime: 'TRENDING' | 'RANGING'
  /** Higher-timeframe (H4) trend bias. */
  htfTrend: Direction
  /** Entry-timeframe (H1) trend bias. */
  ltfTrend: Direction
  trendAligned: boolean
}

/** One indicator's vote toward a directional decision. */
export interface SignalVote {
  name: string
  value: string
  direction: Direction
  /** Contribution weight, 0..1. */
  weight: number
}

/** Result of the SIGNALS stage. */
export interface SignalResult {
  direction: Direction
  /** Net confluence score, -100..100 (sign = direction). */
  score: number
  /** 0..4 discrete strength stars, matching the memo. */
  stars: number
  strength: 'WEAK' | 'MODERATE' | 'STRONG'
  /** Confidence percentage, 0..100. */
  confidence: number
  votes: SignalVote[]
}

/** Result of the PLAN stage — the trade blueprint. */
export interface TradePlan {
  direction: Direction
  entry: number
  entryLow: number
  entryHigh: number
  stop: number
  target: number
  invalidation: number
  /** Reward-to-risk ratio, e.g. 2.15 means 1:2.15. */
  rr: number
  stopDistance: number
  targetDistance: number
  timeframe: string
  priceInEntryZone: boolean
}

/** A single risk gate result. */
export interface RiskCheck {
  name: string
  ok: boolean
  detail: string
}

/** Result of the RISK stage. */
export interface RiskResult {
  pass: boolean
  rating: 'LOW' | 'MODERATE' | 'HIGH'
  /** Number of contracts the sizing model allows (may be micro). */
  contracts: number
  useMicro: boolean
  /** Dollar risk if the stop is hit. */
  dollarRisk: number
  /** Dollar reward if the target is hit. */
  dollarReward: number
  /** Risk as a percentage of account equity. */
  riskPct: number
  checks: RiskCheck[]
  maxLossWithinPlan: boolean
}

export type Verdict = 'APPROVED' | 'WATCHLIST' | 'REJECTED'

/** The Final Decision Memo produced by the VERDICT stage. */
export interface DecisionMemo {
  id: string
  date: string
  instrument: Instrument
  scan: ScanResult
  signal: SignalResult
  plan: TradePlan
  risk: RiskResult
  verdict: Verdict
  /** Plain-language reasons the engine reached this verdict. */
  reasons: string[]
  finalStatus: string
}

/** User-controlled account & risk configuration. */
export interface AccountConfig {
  equity: number
  /** Risk per trade as a fraction of equity, e.g. 0.01 = 1%. */
  riskPerTrade: number
  /** Max total open risk across positions, as a fraction of equity. */
  maxPortfolioRisk: number
  /** Max daily loss before the engine blocks new trades, fraction of equity. */
  maxDailyLoss: number
  /** Current drawdown from peak, fraction (0..1), fed from tracking. */
  currentDrawdown: number
  /** Max tolerated drawdown before blocking, fraction. */
  maxDrawdown: number
  /** Minimum acceptable reward-to-risk ratio. */
  minRR: number
  /** Prefer micro contracts when the full-size position rounds to zero. */
  allowMicro: boolean
}

/** An entry in the 24/7 monitor feed. */
export interface MonitorEvent {
  time: number
  symbol: string
  kind: 'SCAN' | 'SIGNAL' | 'ALERT' | 'APPROVED' | 'WATCHLIST' | 'REJECTED' | 'RISK'
  message: string
}
