
export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH'
}

export enum CryptoCurrency {
  BTC = 'BTC',
  ETH = 'ETH',
  BNB = 'BNB',
  SOL = 'SOL',
  DOGE = 'DOGE'
}

export type Timeframe = '1m' | '15m' | '1h' | '4h' | '1d';

export enum StrategyType {
  MA_CROSSOVER = 'MA_CROSSOVER', // 均线交叉
  RSI_REVERSION = 'RSI_REVERSION', // RSI 均值回归
  BOLLINGER_BREAKOUT = 'BOLLINGER_BREAKOUT', // 布林带突破
  MACD_TREND = 'MACD_TREND', // MACD 趋势跟踪
  EMA_CROSSOVER = 'EMA_CROSSOVER', // EMA 指数均线交叉
  MARTINGALE = 'MARTINGALE', // 马丁网格 (DCA)
  ARBITRAGE = 'ARBITRAGE' // 趋势相关性套利
}

export interface StrategyConfigItem {
  type: StrategyType;
  enabled: boolean;
  weight: number; // 1 - 10
}

export interface StrategyParameters {
  // MA & EMA
  fastPeriod: number;
  slowPeriod: number;
  // RSI
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  // Bollinger
  bbPeriod: number;
  bbStdDev: number;
  // MACD
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  // Martingale
  martingalePriceDrop: number; 
  martingaleProfitTarget: number; 
  martingaleVolumeMultiplier: number; 
}

export interface MarketCandle {
  symbol: string; 
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal?: boolean; 
  candleRange?: [number, number]; // For visualization
}

export interface Trade {
  id: string;
  symbol: string; 
  type: 'BUY' | 'SELL';
  price: number; 
  amount: number;
  leverage: number; 
  timestamp: number;
  pnl?: number; 
  unrealizedPnl?: number; 
  status: 'OPEN' | 'CLOSED';
  strategy: string;
}

export interface SystemConfig {
  apiKey: string; 
  binanceApiKey?: string; 
  initialCapital: number;
  riskLevel: RiskLevel;
  selectedAssets: CryptoCurrency[];
  activeStrategies: StrategyConfigItem[]; 
  timeframe: Timeframe; 
  strategyParams: StrategyParameters; 
  leverage: number; 
}

export interface SystemState {
  balance: number;
  positions: Trade[];
  marketData: Record<string, MarketCandle[]>; 
  isLive: boolean;
  logs: LogEntry[];
  currentPrices: Record<string, number>; 
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'TRADE' | 'AI';
  message: string;
}

// --- New Types for Strategy Dashboard ---

export type MarketRegimeType = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';

export interface MarketRegime {
  type: MarketRegimeType;
  volatility: number; // 0 - 100 normalized
  trendStrength: number; // 0 - 100
  description: string;
}

export interface StrategyInsight {
  type: StrategyType;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  baseWeight: number;
  adjustedWeight: number; // After auto-tuning
  rawScore: number;
  metrics: { label: string; value: string | number }[]; // Key metrics for display
  tuningAction: string; // Description of auto-adjustment
}

export interface CompositeAnalysisResult {
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  score: number;
  regime: MarketRegime;
  insights: StrategyInsight[];
}
