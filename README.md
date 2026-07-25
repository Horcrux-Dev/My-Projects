# 24/7 AI Trader — Futures Decision Engine

A disciplined, transparent decision-support system for **futures** — tuned for
**Gold (GC), NASDAQ-100 (NQ), S&P 500 (ES) and Silver (SI)**.

It turns raw market data into **one clear decision** through a six-stage
pipeline, and — critically — **a human always makes the final call**:

```
SCAN → SIGNALS → PLAN → RISK → MONITOR → VERDICT
```

Every trade idea comes out as a **Final Decision Memo** with a single verdict:
**APPROVED · WATCHLIST · REJECTED**.

> ⚠️ **Not financial advice.** This is a decision-support tool. It ships with a
> deterministic market **simulator** so every number you see (including backtest
> stats) illustrates the *logic*, not live results. Futures trading carries
> substantial risk of loss. Connect a real data + broker adapter and do your own
> due diligence before risking capital.

---

## Why this design gives you an edge

There is no magic "high win-rate" button in trading. A durable edge comes from
**positive expectancy** and **discipline**, and this engine is built around both:

1. **Trade with the higher timeframe, never against it.** The H4 trend is a hard
   filter; setups that fight it are heavily down-weighted (SCAN + SIGNALS).
2. **Demand confluence.** Seven independent indicators (EMA stack, MACD, RSI,
   Stochastic, ADX/DI, Bollinger position, H4 trend) must *agree* before a setup
   is graded STRONG. One indicator is noise; agreement is signal.
3. **Only trade quality regimes.** Choppy, low-ADX markets are dampened; dead or
   berserk volatility is rejected outright (RISK volatility check).
4. **Fix the downside first.** Position size is derived *from* the stop, capped by
   per-trade risk, portfolio exposure, drawdown and a daily-loss limit. Any failed
   check **blocks** the trade.
5. **Filter by reward-to-risk.** Setups below your minimum R:R are rejected, so the
   surviving trades pay you more when right than they cost when wrong.

On the bundled simulated data this produces a **positive expectancy** (~+0.3 to
+0.6R per trade at a ~53% win rate across hundreds of trades). The exact same
code produces *live* statistics when you attach live data — the point is the
process, and the process is auditable end to end.

---

## The pipeline

| Stage | What it does |
|-------|--------------|
| **SCAN** | Reads price across H1/H4, computes ATR (volatility), ADX (trend strength), regime (trending/ranging) and multi-timeframe trend bias. |
| **SIGNALS** | Scores a directional **confluence** from 7 indicators → direction, 0–4★ strength, confidence %. Counter-trend and chop are penalised. |
| **PLAN** | Builds the trade: entry zone, structure-based stop (bounded by ATR), target at the next key level, invalidation, and R:R. |
| **RISK** | The gauntlet: position size → exposure → drawdown → volatility → max loss. All must **PASS** or the trade is **BLOCKED**. |
| **MONITOR** | A 24/7 loop that re-scans every instrument, maintains the watchlist and fires alerts when a verdict changes. |
| **VERDICT** | Combines everything into one call — **APPROVED / WATCHLIST / REJECTED** — with a plain-language rationale. Human approval required. |

---

## Quick start

```bash
npm install
npm run dev        # open http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
npm run test       # engine unit tests (node:test via tsx)
npm run typecheck  # type-check only
```

The app works **immediately with no API keys** thanks to the built-in simulator.

### Using it

- Switch instruments with the **GC / NQ / ES / SI** tabs.
- **Start 24/7 Monitor** to run the continuous scan loop and populate the event feed.
- **Re-scan** rolls the market forward one step.
- **Risk Settings** lets you set account equity, risk per trade, exposure and
  drawdown limits, minimum R:R and micro-contract usage — every downstream
  decision reacts live.

---

## Going live

The engine is data-source agnostic. To trade real markets:

1. Copy `.env.example` → `.env` and set `VITE_DATA_URL` (and key if needed).
2. Implement/point `LiveHttpProvider` (see `src/engine/liveData.ts`) at your
   vendor — Databento, Polygon, Tradovate, Rithmic, IBKR gateway, etc. — and map
   its bar fields in `mapBar` and its symbols in `DEFAULT_SYMBOL_MAP`.
3. In `src/App.tsx`, swap `new SimulatedProvider(seed)` for your live provider.
4. Order execution is intentionally **not** wired — the human places the trade.
   To automate, add a broker adapter behind the APPROVED verdict, keeping the
   RISK gate as the last line of defence.

---

## Architecture

```
src/
  engine/                 # pure, framework-free trading engine (unit-tested)
    types.ts              # domain model
    instruments.ts        # GC / NQ / ES / SI contract specs (+ micros)
    indicators.ts         # EMA, RSI, MACD, ATR, ADX, Stochastic, Bollinger, swings
    marketData.ts         # deterministic simulator + provider interface
    liveData.ts           # optional live REST adapter
    scan.ts               # SCAN stage
    signals.ts            # SIGNALS stage (confluence scoring)
    plan.ts               # PLAN stage (entry/stop/target/R:R)
    risk.ts               # RISK stage (5-check gauntlet)
    verdict.ts            # VERDICT stage (APPROVED/WATCHLIST/REJECTED)
    pipeline.ts           # orchestrator
    backtest.ts           # walk-forward backtester
    engine.test.ts        # unit tests
  components/             # React UI (blueprint aesthetic)
    DecisionMemo.tsx      # the Final Decision Memo hero
    TradeChart.tsx        # SVG candlesticks + plan levels
    ui.tsx                # gauge, stars, sparkline, badges
  App.tsx                 # app shell, state, 24/7 monitor loop
  styles/theme.css        # the engineering-blueprint design system
```

The engine is deliberately **pure TypeScript with zero dependencies** — you can
import it into a bot, a backtest harness, or a server without touching React.

---

## Design

The interface follows an **engineering-blueprint** language: cream paper, bold
condensed headlines, an orange accent, monospace data, registration marks and a
ruler footer — so a serious tool *reads* like a serious tool.

Built with React + TypeScript + Vite.
