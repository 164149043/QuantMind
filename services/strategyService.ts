
import { MarketCandle, StrategyType, Trade, CryptoCurrency, StrategyParameters, StrategyConfigItem, MarketRegime, MarketRegimeType, StrategyInsight, CompositeAnalysisResult } from "../types";

// --- Math Helpers ---
const calculateSMA = (data: number[], period: number): number => {
  if (data.length < period) return 0;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
};

const calculateEMASeries = (data: number[], period: number): number[] => {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const emaArray = [data[0]]; 
  for (let i = 1; i < data.length; i++) {
    const ema = data[i] * k + emaArray[i - 1] * (1 - k);
    emaArray.push(ema);
  }
  return emaArray;
};

const calculateStdDev = (data: number[]): number => {
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
  return Math.sqrt(variance);
};

const calculateRSI = (candles: MarketCandle[], period: number = 14): number => {
  if (candles.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
};

// --- Market Regime Analysis ---
export const analyzeMarketRegime = (candles: MarketCandle[]): MarketRegime => {
  if (candles.length < 30) {
    return { type: 'RANGING', volatility: 0, trendStrength: 0, description: 'Insufficient Data' };
  }
  
  const closes = candles.map(c => c.close);
  const period = 20;
  
  // 1. Calculate Volatility (Normalized ATR-like metric)
  // We use StdDev of % changes to be scale-invariant
  const returns = [];
  for(let i=1; i<closes.length; i++) {
    returns.push((closes[i] - closes[i-1]) / closes[i-1]);
  }
  const recentReturns = returns.slice(-period);
  const volRaw = calculateStdDev(recentReturns) * Math.sqrt(period); // Annualized-ish
  const volatilityScore = Math.min(100, volRaw * 10000); // Normalize to 0-100 scale roughly

  // 2. Calculate Trend Strength (Linear Regression Slope + Consistency)
  const len = closes.length;
  const shortMa = calculateSMA(closes, 7);
  const longMa = calculateSMA(closes, 25);
  const gap = (shortMa - longMa) / longMa;
  const trendScore = Math.min(100, Math.abs(gap) * 5000); // Normalize

  let type: MarketRegimeType = 'RANGING';
  let description = "横盘整理 (Consolidation)";

  if (volatilityScore > 60) {
    type = 'VOLATILE';
    description = "高波动剧烈震荡";
  } else if (trendScore > 20) {
    if (shortMa > longMa) {
      type = 'TRENDING_UP';
      description = "强势多头趋势";
    } else {
      type = 'TRENDING_DOWN';
      description = "强势空头趋势";
    }
  }

  return {
    type,
    volatility: volatilityScore,
    trendStrength: trendScore,
    description
  };
};

// --- Single Strategy Analysis ---
const getStrategyInsight = (
  strategy: StrategyType,
  candles: MarketCandle[],
  activePositions: Trade[],
  allMarketData: Record<string, MarketCandle[]>,
  params: StrategyParameters,
  regime: MarketRegime
): Omit<StrategyInsight, 'baseWeight' | 'adjustedWeight'> => {
  
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  const symbol = candles[0]?.symbol;

  let signal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  let rawScore = 0;
  let metrics: { label: string; value: string | number }[] = [];
  let tuningAction = "Parameters optimal";

  switch (strategy) {
    case StrategyType.MA_CROSSOVER: {
      const maFast = calculateSMA(closes, params.fastPeriod);
      const maSlow = calculateSMA(closes, params.slowPeriod);
      const spread = ((maFast - maSlow) / maSlow) * 100;
      
      metrics = [
        { label: `MA(${params.fastPeriod})`, value: maFast.toFixed(2) },
        { label: `MA(${params.slowPeriod})`, value: maSlow.toFixed(2) },
        { label: 'Spread', value: `${spread.toFixed(3)}%` }
      ];

      // Signal Logic
      if (maFast > maSlow && spread > 0.05) { signal = 'BUY'; rawScore = 0.8; }
      else if (maFast < maSlow && spread < -0.05) { signal = 'SELL'; rawScore = -0.8; }
      
      // Auto-Tuning Logic
      if (regime.type === 'RANGING') tuningAction = "Market choppy: Decreasing sensitivity";
      else tuningAction = "Trend detected: Following trend";
      break;
    }
    
    case StrategyType.RSI_REVERSION: {
      const rsi = calculateRSI(candles, params.rsiPeriod);
      metrics = [{ label: 'RSI', value: rsi.toFixed(1) }];
      
      // Dynamic Thresholds based on Regime (智能阈值调整)
      let buyThresh = params.rsiOversold;
      let sellThresh = params.rsiOverbought;
      
      // Calculate dynamic offset based on trend strength (0-100)
      // Trend Strength / 5 => 0 to 20 points adjustment
      const trendOffset = Math.floor(regime.trendStrength / 5);

      if (regime.type === 'TRENDING_UP') {
         // 上升趋势 (Uptrend): 
         // 1. RSI 常滞留在超买区，做空极易止损 -> 大幅提高卖出阈值 (Avoid Shorts)
         // 2. 回调即买入机会 -> 保持或微调买入阈值
         sellThresh += (5 + trendOffset); 
         
         tuningAction = `Uptrend (Str:${regime.trendStrength.toFixed(0)}): Raised Sell Limit to ${sellThresh}`;
      } else if (regime.type === 'TRENDING_DOWN') {
         // 下跌趋势 (Downtrend):
         // 1. RSI 常滞留在超卖区，做多极易“接飞刀” -> 大幅降低买入阈值 (Avoid Longs)
         buyThresh -= (5 + trendOffset);
         
         tuningAction = `Downtrend (Str:${regime.trendStrength.toFixed(0)}): Lowered Buy Limit to ${buyThresh}`;
      } else if (regime.type === 'VOLATILE') {
         // 高波动 (Volatile): 扩大双边阈值过滤噪音
         buyThresh -= 5;
         sellThresh += 5;
         tuningAction = "High Volatility: Widen Thresholds (+/-5)";
      } else {
         // 震荡/横盘 (Ranging): 使用默认回归逻辑
         tuningAction = "Ranging: Standard Reversion Logic";
      }
      
      metrics.push({ label: 'Dyn Buy', value: buyThresh.toFixed(0) });
      metrics.push({ label: 'Dyn Sell', value: sellThresh.toFixed(0) });

      if (rsi < buyThresh) { signal = 'BUY'; rawScore = 1; }
      else if (rsi > sellThresh) { signal = 'SELL'; rawScore = -1; }
      break;
    }

    case StrategyType.BOLLINGER_BREAKOUT: {
      const sma = calculateSMA(closes, params.bbPeriod);
      const slice = closes.slice(-params.bbPeriod);
      const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / params.bbPeriod;
      const stdDev = Math.sqrt(variance);
      const upper = sma + stdDev * params.bbStdDev;
      const lower = sma - stdDev * params.bbStdDev;
      
      const widthPct = ((upper - lower) / sma) * 100;

      metrics = [
        { label: 'Upper', value: upper.toFixed(2) },
        { label: 'Lower', value: lower.toFixed(2) },
        { label: 'Band Width', value: `${widthPct.toFixed(2)}%` }
      ];

      if (currentPrice < lower) { signal = 'BUY'; rawScore = 1; } 
      else if (currentPrice > upper) { signal = 'SELL'; rawScore = -1; }
      
      if (regime.volatility > 80) tuningAction = "High Volatility: Reducing breakout sensitivity";
      break;
    }

    case StrategyType.MACD_TREND: {
       const emaFast = calculateEMASeries(closes, params.macdFast);
       const emaSlow = calculateEMASeries(closes, params.macdSlow);
       const macdLine = emaFast[emaFast.length-1] - emaSlow[emaSlow.length-1];
       // Simplified signal line for snapshot
       const macdSeries = emaFast.map((v, i) => v - emaSlow[i]);
       const signalSeries = calculateEMASeries(macdSeries, params.macdSignal);
       const signalLine = signalSeries[signalSeries.length-1];
       const hist = macdLine - signalLine;

       metrics = [
         { label: 'MACD', value: macdLine.toFixed(2) },
         { label: 'Signal', value: signalLine.toFixed(2) },
         { label: 'Histogram', value: hist.toFixed(4) }
       ];

       if (hist > 0 && macdLine > 0) { signal = 'BUY'; rawScore = 0.7; }
       if (hist < 0 && macdLine < 0) { signal = 'SELL'; rawScore = -0.7; }
       
       if (regime.type === 'RANGING') tuningAction = "Ranging: MACD weight suppressed";
       else tuningAction = "Trending: MACD weight boosted";
       break;
    }
    
    // ... Implement basic info for others or defaults
    default:
       metrics = [{ label: 'Status', value: 'Active' }];
       break;
  }

  return { type: strategy, signal, rawScore, metrics, tuningAction };
};


// --- Composite System ---
export const getCompositeStrategySignal = (
    strategies: StrategyConfigItem[],
    candles: MarketCandle[],
    activePositions: Trade[] = [],
    allMarketData: Record<string, MarketCandle[]> = {},
    params: StrategyParameters
): CompositeAnalysisResult => {
    
    const regime = analyzeMarketRegime(candles);
    const insights: StrategyInsight[] = [];
    
    let totalScore = 0;
    let totalWeight = 0;

    strategies.filter(s => s.enabled).forEach(configItem => {
        const rawInsight = getStrategyInsight(configItem.type, candles, activePositions, allMarketData, params, regime);
        
        // --- AUTO-TUNING (Regime Switching) ---
        let adjustedWeight = configItem.weight;
        
        // 1. Trend Strategies: Boost in Trends, Suppress in Range
        if (['MA_CROSSOVER', 'EMA_CROSSOVER', 'MACD_TREND'].includes(configItem.type)) {
            if (regime.type.includes('TRENDING')) adjustedWeight *= 1.5;
            else if (regime.type === 'RANGING') adjustedWeight *= 0.5;
        }
        
        // 2. Reversion Strategies: Boost in Range, Suppress in Strong Trend
        if (['RSI_REVERSION', 'BOLLINGER_BREAKOUT'].includes(configItem.type)) {
             if (regime.type === 'RANGING') adjustedWeight *= 1.5;
             else if (regime.trendStrength > 70) adjustedWeight *= 0.5; // Dangerous to mean revert in strong trend
        }

        // 3. Volatility Check
        if (regime.type === 'VOLATILE') {
             // Reduce confidence in laggy indicators
             if (configItem.type === 'MA_CROSSOVER') adjustedWeight *= 0.7;
        }

        adjustedWeight = parseFloat(adjustedWeight.toFixed(2));
        
        const numericSignal = rawInsight.signal === 'BUY' ? 1 : (rawInsight.signal === 'SELL' ? -1 : 0);
        totalScore += numericSignal * adjustedWeight;
        totalWeight += adjustedWeight;
        
        insights.push({
            ...rawInsight,
            baseWeight: configItem.weight,
            adjustedWeight
        });
    });

    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    
    // Thresholds
    let finalSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    if (finalScore > 0.25) finalSignal = 'BUY';
    else if (finalScore < -0.25) finalSignal = 'SELL';

    return {
        signal: finalSignal,
        score: finalScore,
        regime,
        insights
    };
};
