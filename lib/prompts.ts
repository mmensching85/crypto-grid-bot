// ── PRICE FETCH — Call 1 (with search) ───────────────────────────────────────
export const PRICE_FETCH_PROMPT = `Crypto price assistant. ALWAYS search — never use training data.

Search: "[COIN] price USD 7 day high low today"

Return raw JSON only:
{"coin":string,"currentPrice":number,"change24h":number,"change7d":number,"weekHigh":number,"weekLow":number,"atrPct":number,"priceSource":string,"sparkline":[number,number,number,number,number,number,number]}

- currentPrice: live price from search. Not training data.
- atrPct: (weekHigh-weekLow)/7/currentPrice*100
- sparkline: 7 daily closes ending at currentPrice
- All numbers, no strings for numeric fields.`;

// ── CONFIG GEN — Call 2 (no search) ──────────────────────────────────────────
export const CONFIG_GEN_PROMPT = `Pionex grid bot configurator. Given price data and capital, output configs for 3 ranges.

Return raw JSON only:
{"suggestedRanges":[{"label":"Conservative","upperPrice":number,"lowerPrice":number,"rangePercent":string,"description":string},{"label":"Moderate","upperPrice":number,"lowerPrice":number,"rangePercent":string,"description":string},{"label":"Aggressive","upperPrice":number,"lowerPrice":number,"rangePercent":string,"description":string}],"configs":{"Conservative":{"gridCount":number,"upperPrice":number,"lowerPrice":number,"capitalPerGrid":number,"estimatedMonthlyROI":string,"netMonthlyROI":string,"stopLoss":number,"takeProfit":number,"gridSpacing":string,"gridSpacingPct":number,"gridType":"arithmetic","gridTypeReason":string,"minProfitableSpacing":0.1,"estMonthlyTrades":number,"estMonthlyFees":number,"healthScore":number,"healthBreakdown":{"spacingVsFees":number,"rangeVsVolatility":number,"capitalPerGridScore":number,"stopLossScore":number},"breakEvenTrades":number,"breakEvenDays":number,"historicalRangeFit":string,"historicalRangePct":number,"rebalanceThresholdPct":number,"rebalanceSuggestion":string,"riskLevel":"Low","marketCondition":string,"reasoning":string,"warnings":[],"tips":[]},"Moderate":{"gridCount":number,"upperPrice":number,"lowerPrice":number,"capitalPerGrid":number,"estimatedMonthlyROI":string,"netMonthlyROI":string,"stopLoss":number,"takeProfit":number,"gridSpacing":string,"gridSpacingPct":number,"gridType":"arithmetic","gridTypeReason":string,"minProfitableSpacing":0.1,"estMonthlyTrades":number,"estMonthlyFees":number,"healthScore":number,"healthBreakdown":{"spacingVsFees":number,"rangeVsVolatility":number,"capitalPerGridScore":number,"stopLossScore":number},"breakEvenTrades":number,"breakEvenDays":number,"historicalRangeFit":string,"historicalRangePct":number,"rebalanceThresholdPct":number,"rebalanceSuggestion":string,"riskLevel":"Medium","marketCondition":string,"reasoning":string,"warnings":[],"tips":[]},"Aggressive":{"gridCount":number,"upperPrice":number,"lowerPrice":number,"capitalPerGrid":number,"estimatedMonthlyROI":string,"netMonthlyROI":string,"stopLoss":number,"takeProfit":number,"gridSpacing":string,"gridSpacingPct":number,"gridType":"geometric","gridTypeReason":string,"minProfitableSpacing":0.1,"estMonthlyTrades":number,"estMonthlyFees":number,"healthScore":number,"healthBreakdown":{"spacingVsFees":number,"rangeVsVolatility":number,"capitalPerGridScore":number,"stopLossScore":number},"breakEvenTrades":number,"breakEvenDays":number,"historicalRangeFit":string,"historicalRangePct":number,"rebalanceThresholdPct":number,"rebalanceSuggestion":string,"riskLevel":"High","marketCondition":string,"reasoning":string,"warnings":[],"tips":[]}}}

Rules:
- Conservative ±15-20%, Moderate ±25-35%, Aggressive ±45-65% of currentPrice.
- Use EXACT currentPrice given. gridType: geometric if range >30%, arithmetic if <25%.
- Pionex fee 0.1% round-trip. estMonthlyFees = estMonthlyTrades * capitalPerGrid * 0.001.
- estimatedMonthlyROI = gross %. netMonthlyROI = gross minus fees. Realistic: 2-8% gross.
- healthScore = spacingVsFees(0-25) + rangeVsVolatility(0-25) + capitalPerGridScore(0-25) + stopLossScore(0-25).
- historicalRangePct: 70-95% if range >> 7d swing, 40-65% if tight.
- rebalanceThresholdPct: 10-20% beyond range. All values plain numbers.`;

// ── ALLOCATOR — Single call (with search) ─────────────────────────────────────
export const ALLOCATOR_PROMPT = `Crypto portfolio allocator for grid bots.

Search: "[coin1] [coin2] [coin3] price USD today" — get live prices first.

Return raw JSON only:
{"totalCapital":number,"allocations":[{"coin":string,"currentPrice":number,"allocatedCapital":number,"allocationPct":number,"rationale":string,"suggestedRange":{"upper":number,"lower":number},"expectedNetROI":string,"riskLevel":"Low|Medium|High","priority":number}],"portfolioNetROI":string,"diversificationScore":number,"allocationReasoning":string,"warnings":[]}

- currentPrice must be from search. Never training data.
- Weight by: volatility, correlation, ROI after Pionex 0.1% fees.
- Min allocation $50/bot. diversificationScore 0-100. Priority 1 = highest.`;

// ── GOAL FINDER — Single combined call (with search) ─────────────────────────
// Merged scan + config into ONE call — cuts cost from ~$0.13 to ~$0.04
export const GOAL_FINDER_PROMPT = `Crypto grid bot goal analyst. Find ranging altcoins and calculate configs to hit a profit target.

Do TWO searches:
1. "best ranging altcoins grid bot consolidating sideways [current month year]" — find 4-5 ranging coins.
2. "[COIN1] [COIN2] [COIN3] [COIN4] price USD today" — get live prices for those coins.

Return raw JSON only:
{"goalUSD":number,"goalDays":number,"requiredDailyROI":number,"candidates":[{"rank":number,"coin":string,"currentPrice":number,"why":string,"volatilityProfile":string,"requiredCapital":number,"gridConfig":{"upperPrice":number,"lowerPrice":number,"gridCount":number,"gridType":"arithmetic or geometric","gridSpacing":string,"capitalPerGrid":number,"estDailyROIPct":number,"estDailyProfitUSD":number,"netProfitOverPeriod":number,"estMonthlyFees":number,"healthScore":number,"riskLevel":"Low or Medium or High"},"feasibility":"High or Medium or Low","feasibilityReason":string,"stopLoss":number,"takeProfit":number}],"bestPick":string,"bestPickReason":string,"warnings":[]}

STRICT RULES:
- NEVER include BTC or ETH — remove them even if search returns them. They require too much capital.
- Only altcoins under $100 price — lower priced coins need less capital per grid.
- currentPrice MUST be from search. Training data prices are always wrong.
- Ranging = 7d change between -15% and +15%, bouncing between support/resistance.
- Prefer: SUI, ADA, XRP, DOGE, AVAX, LINK, INJ, NEAR, APT, ARB, PEPE, WIF, BONK, SOL.
- Realistic daily net ROI: 0.2-0.4% for volatile altcoins. requiredCapital = goalUSD / (estDailyROIPct/100 * goalDays).
- Use higher estDailyROIPct (0.3-0.4%) for high-volatility coins to reduce required capital.
- gridCount = round(rangeWidth/3), min 10, max 40. Pionex fee 0.1% round-trip.
- feasibility: High if capital<$3k, Medium $3k-$10k, Low >$10k.
- Rank by LOWEST required capital first — users want affordable options.
- bestPick = lowest capital requirement with High feasibility.
- IMPORTANT: Show a warning if goal requires >$10k for ALL coins suggesting user lower target or extend timeframe.`;
