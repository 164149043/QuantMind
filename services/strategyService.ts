
import { MarketCandle, StrategyType, Trade, CryptoCurrency, StrategyParameters, StrategyConfigItem } from "../types";

// Technical Indicator Helpers
const calculateSMA = (data: number[], period: number): number => {
  if (data.length < period) return 0;
  const slice = data.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
};

// Calculate Exponential Moving Average Series
const calculateEMASeries = (data: number[], period: number): number[] => {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const emaArray = [data[0]]; // Start with SMA logic or just first element for simplicity in streaming
  
  for (let i = 1; i < data.length; i++) {
    const ema = data[i] * k + emaArray[i - 1] * (1 - k);
    emaArray.push(ema);
  }
  return emaArray;
};

const calculateRSI = (candles: MarketCandle[], period: number = 14): number => {
  if (candles.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;

  // Simple RSI calculation for efficiency
  for (let i = candles.length - period; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff; // absolute value
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
};

const calculateBollingerBands = (candles: MarketCandle[], period: number = 20, stdDevMult: number = 2) => {
  const closes = candles.map(c => c.close);
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0 };

  const sma = calculateSMA(closes, period);
  const slice = closes.slice(-period);
  const squaredDiffs = slice.map(val => Math.pow(val - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    middle: sma,
    upper: sma + (stdDev * stdDevMult),
    lower: sma - (stdDev * stdDevMult)
  };
};

// MACD Calculation Logic
const calculateMACD = (candles: MarketCandle[], fast: number, slow: number, signal: number) => {
    const closes = candles.map(c => c.close);
    // Need at least slow + signal candles for stable calculation
    if (closes.length < slow + signal) return { macdLine: 0, signalLine: 0, prevMacdLine: 0, prevSignalLine: 0 };

    const emaFast = calculateEMASeries(closes, fast);
    const emaSlow = calculateEMASeries(closes, slow);

    // MACD Line = EMA(Fast) - EMA(Slow)
    const macdLineSeries: number[] = [];
    for(let i = 0; i < closes.length; i++) {
        macdLineSeries.push(emaFast[i] - emaSlow[i]);
    }

    // Signal Line = EMA(Signal) of MACD Line
    const signalLineSeries = calculateEMASeries(macdLineSeries, signal);

    const macdLine = macdLineSeries[macdLineSeries.length - 1];
    const signalLine = signalLineSeries[signalLineSeries.length - 1];
    const prevMacdLine = macdLineSeries[macdLineSeries.length - 2];
    const prevSignalLine = signalLineSeries[signalLineSeries.length - 2];

    return { macdLine, signalLine, prevMacdLine, prevSignalLine };
};

// Individual Strategy Signal Generator
export const getStrategySignal = (
  strategy: StrategyType,
  candles: MarketCandle[],
  activePositions: Trade[] = [], // Optional: for Martingale
  allMarketData: Record<string, MarketCandle[]> = {}, // Optional: for Arbitrage
  params: StrategyParameters // Required now
): 'BUY' | 'SELL' | 'NEUTRAL' => {
  
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  const symbol = candles[0]?.symbol;

  switch (strategy) {
    case StrategyType.MA_CROSSOVER: {
      // Enhanced MA Crossover Strategy with Robust Slope Detection
      const fastP = params.fastPeriod;
      const slowP = params.slowPeriod;

      if (closes.length < slowP + 5) return 'NEUTRAL';
      
      const maFast = calculateSMA(closes, fastP);
      const maSlow = calculateSMA(closes, slowP);
      const prevMaFast = calculateSMA(closes.slice(0, -1), fastP);
      const prevMaSlow = calculateSMA(closes.slice(0, -1), slowP);
      
      // Slope calculation
      const maFast_prev3 = calculateSMA(closes.slice(0, -3), fastP);
      const maSlow_prev3 = calculateSMA(closes.slice(0, -3), slowP);

      const slopeFast = (maFast - maFast_prev3) / 3;
      const slopeSlow = (maSlow - maSlow_prev3) / 3;
      
      const isGoldenCross = prevMaFast <= prevMaSlow && maFast > maSlow;
      const isDeathCross = prevMaFast >= prevMaSlow && maFast < maSlow;

      if (!isGoldenCross && !isDeathCross) return 'NEUTRAL';

      const slopeThreshold = currentPrice * 0.00005; 

      if (isGoldenCross) {
        if (slopeFast > slopeThreshold && slopeSlow > -slopeThreshold) return 'BUY';
      }
      if (isDeathCross) {
        if (slopeFast < -slopeThreshold && slopeSlow < slopeThreshold) return 'SELL';
      }
      return 'NEUTRAL';
    }

    case StrategyType.EMA_CROSSOVER: {
      const fastP = params.fastPeriod;
      const slowP = params.slowPeriod;

      if (closes.length < slowP + 1) return 'NEUTRAL';

      const emaFastSeries = calculateEMASeries(closes, fastP);
      const emaSlowSeries = calculateEMASeries(closes, slowP);
      
      const emaFast = emaFastSeries[emaFastSeries.length - 1];
      const emaSlow = emaSlowSeries[emaSlowSeries.length - 1];
      const prevEmaFast = emaFastSeries[emaFastSeries.length - 2];
      const prevEmaSlow = emaSlowSeries[emaSlowSeries.length - 2];

      if (prevEmaFast <= prevEmaSlow && emaFast > emaSlow) return 'BUY';
      if (prevEmaFast >= prevEmaSlow && emaFast < emaSlow) return 'SELL';
      return 'NEUTRAL';
    }

    case StrategyType.RSI_REVERSION: {
      const rsi = calculateRSI(candles, params.rsiPeriod);
      if (rsi < params.rsiOversold) return 'BUY';
      if (rsi > params.rsiOverbought) return 'SELL';
      return 'NEUTRAL';
    }

    case StrategyType.BOLLINGER_BREAKOUT: {
      const { lower, upper } = calculateBollingerBands(candles, params.bbPeriod, params.bbStdDev);
      if (lower === 0) return 'NEUTRAL';
      
      if (currentPrice <= lower) return 'BUY';
      if (currentPrice >= upper) return 'SELL';
      return 'NEUTRAL';
    }

    case StrategyType.MACD_TREND: {
       const { macdLine, signalLine, prevMacdLine, prevSignalLine } = calculateMACD(candles, params.macdFast, params.macdSlow, params.macdSignal);
       if (macdLine === 0 && signalLine === 0) return 'NEUTRAL';

       if (prevMacdLine <= prevSignalLine && macdLine > signalLine) return 'BUY';
       if (prevMacdLine >= prevSignalLine && macdLine < signalLine) return 'SELL';
       return 'NEUTRAL';
    }

    case StrategyType.MARTINGALE: {
      const symbolPositions = activePositions.filter(p => p.symbol === symbol && p.status === 'OPEN');
      
      if (symbolPositions.length === 0) {
          const rsi = calculateRSI(candles, params.rsiPeriod);
          if (rsi < (params.rsiOversold + 10)) return 'BUY'; 
          return 'NEUTRAL';
      }

      const lastTrade = symbolPositions[symbolPositions.length - 1];
      const entryPrice = lastTrade.price;
      const priceChangePercent = (currentPrice - entryPrice) / entryPrice;
      const dropThreshold = -(params.martingalePriceDrop / 100);
      
      if (priceChangePercent < dropThreshold) return 'BUY';

      const profitThreshold = (params.martingaleProfitTarget / 100);
      let totalVol = 0;
      let totalCost = 0;
      symbolPositions.forEach(p => {
          totalVol += p.amount;
          totalCost += (p.amount * p.price);
      });
      const avgPrice = totalCost / totalVol;
      const avgPriceChange = (currentPrice - avgPrice) / avgPrice;

      if (avgPriceChange > profitThreshold) return 'SELL';
      return 'NEUTRAL';
    }

    case StrategyType.ARBITRAGE: {
      // Logic: Monitor BTC as the market leader.
      // If BTC moves significantly (considering volatility) and the target asset lags (considering volume depth),
      // enter a position expecting correlation catch-up.
      
      const btcData = allMarketData[CryptoCurrency.BTC];
      if (!btcData || btcData.length < 30 || !symbol) return 'NEUTRAL';
      // Do not run arbitrage on BTC itself
      if (symbol === CryptoCurrency.BTC) return 'NEUTRAL';

      const btcCloses = btcData.map(c => c.close);
      const assetCloses = candles.map(c => c.close);
      
      // 1. Calculate BTC Volatility (Risk Metrics)
      // Uses standard deviation of returns over the last 20 periods
      const period = 20;
      const btcReturns: number[] = [];
      
      // Safety: Ensure start index is at least 1 to perform (i-1) check
      const startIdx = Math.max(1, btcCloses.length - period);
      
      for(let i = startIdx; i < btcCloses.length; i++) {
          const ret = (btcCloses[i] - btcCloses[i-1]) / btcCloses[i-1];
          btcReturns.push(ret);
      }
      
      if (btcReturns.length === 0) return 'NEUTRAL';

      const avgRet = btcReturns.reduce((a,b) => a+b, 0) / btcReturns.length;
      const variance = btcReturns.reduce((a,b) => a + Math.pow(b - avgRet, 2), 0) / btcReturns.length;
      const btcVolatility = Math.sqrt(variance); // 1-period volatility

      // 2. Check Target Asset Liquidity (Depth Proxy)
      // If asset volume is unusually low, the lag might be due to lack of interest/liquidity, which is a trap.
      const assetVolumes = candles.slice(-period).map(c => c.volume);
      if (assetVolumes.length === 0) return 'NEUTRAL';
      
      const avgVol = assetVolumes.reduce((a,b) => a+b, 0) / assetVolumes.length;
      const currentVol = candles[candles.length - 1].volume;
      
      // Require current volume to be at least 40% of recent average to ensure tradability
      if (currentVol < avgVol * 0.4) return 'NEUTRAL';

      // 3. Momentum Comparison (Lookback Window)
      const lookback = 5;
      const currentBtcPrice = btcCloses[btcCloses.length - 1];
      const prevBtcPrice = btcCloses[btcCloses.length - 1 - lookback];
      
      const currentAssetPrice = assetCloses[assetCloses.length - 1];
      const prevAssetPrice = assetCloses[assetCloses.length - 1 - lookback];

      if (!prevBtcPrice || !prevAssetPrice) return 'NEUTRAL';

      const btcReturn = (currentBtcPrice - prevBtcPrice) / prevBtcPrice;
      const assetReturn = (currentAssetPrice - prevAssetPrice) / prevAssetPrice;

      // 4. Dynamic Thresholds
      // BTC move needs to be significant relative to its recent volatility to justify a trend.
      // We scale 1-min volatility to the lookback period (approx sqrt(5)).
      // Threshold = 1.5 standard deviations of the 5-min move.
      // Base floor of 0.35% to avoid noise in flat markets.
      const volatilityThreshold = btcVolatility * Math.sqrt(lookback) * 1.5;
      const minMoveThreshold = Math.max(0.0035, volatilityThreshold); 

      // 5. Signal Generation
      // BUY: BTC Pumps, Asset Lags significantly (less than 50% participation)
      if (btcReturn > minMoveThreshold && assetReturn < (btcReturn * 0.5)) {
          return 'BUY';
      }

      // SELL: BTC Dumps, Asset Lags significantly
      if (btcReturn < -minMoveThreshold && assetReturn > (btcReturn * 0.5)) {
          return 'SELL';
      }

      return 'NEUTRAL';
    }

    default:
      return 'NEUTRAL';
  }
};

// Composite Signal Generator (Weighted Average)
export const getCompositeStrategySignal = (
    strategies: StrategyConfigItem[],
    candles: MarketCandle[],
    activePositions: Trade[] = [],
    allMarketData: Record<string, MarketCandle[]> = {},
    params: StrategyParameters
): { 
    signal: 'BUY' | 'SELL' | 'NEUTRAL', 
    score: number, 
    breakdown: { type: StrategyType, signal: string, weight: number }[] 
} => {
    let totalScore = 0;
    let totalWeight = 0;
    const breakdown: { type: StrategyType, signal: string, weight: number }[] = [];

    strategies.filter(s => s.enabled).forEach(strategy => {
        const rawSignal = getStrategySignal(strategy.type, candles, activePositions, allMarketData, params);
        let numericSignal = 0;
        if (rawSignal === 'BUY') numericSignal = 1;
        if (rawSignal === 'SELL') numericSignal = -1;

        totalScore += numericSignal * strategy.weight;
        totalWeight += strategy.weight;
        
        breakdown.push({
            type: strategy.type,
            signal: rawSignal,
            weight: strategy.weight
        });
    });

    if (totalWeight === 0) return { signal: 'NEUTRAL', score: 0, breakdown };

    const finalScore = totalScore / totalWeight;

    // Thresholds for composite decision
    // > 0.25 -> BUY (implies consensus or strong weighted signal)
    // < -0.25 -> SELL
    let finalSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    if (finalScore > 0.25) finalSignal = 'BUY';
    else if (finalScore < -0.25) finalSignal = 'SELL';

    return { signal: finalSignal, score: finalScore, breakdown };
};
