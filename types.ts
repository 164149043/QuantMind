
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
  martingalePriceDrop: number; // Percentage drop to trigger add (e.g., 1.5 for 1.5%)
  martingaleProfitTarget: number; // Percentage gain to take profit (e.g., 2.5 for 2.5%)
  martingaleVolumeMultiplier: number; // Multiplier for next order size (e.g. 2 for doubling down, 1 for linear)
}

export interface MarketCandle {
  symbol: string; // Added to track source
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal?: boolean; // From Binance to know if candle closed
}

export interface Trade {
  id: string;
  symbol: string; // Changed to string to match CryptoCurrency values easily
  type: 'BUY' | 'SELL';
  price: number; // Entry Price
  amount: number;
  leverage: number; // Leverage used
  timestamp: number;
  pnl?: number; // Realized PnL
  unrealizedPnl?: number; // Calculated live
  status: 'OPEN' | 'CLOSED';
  strategy: string;
}

export interface SystemConfig {
  apiKey: string; // For Gemini
  binanceApiKey?: string; // Added for Binance Real Trading
  initialCapital: number;
  riskLevel: RiskLevel;
  selectedAssets: CryptoCurrency[];
  activeStrategies: StrategyConfigItem[]; // CHANGED: Support multiple strategies
  timeframe: Timeframe; // Added Timeframe selection
  strategyParams: StrategyParameters; // New configurable parameters
  leverage: number; // Trading leverage
}

export interface SystemState {
  balance: number;
  positions: Trade[];
  marketData: Record<string, MarketCandle[]>; // Key is symbol (e.g., 'BTC')
  isLive: boolean;
  logs: LogEntry[];
  currentPrices: Record<string, number>; // Map of current prices for all assets
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'TRADE' | 'AI';
  message: string;
}
