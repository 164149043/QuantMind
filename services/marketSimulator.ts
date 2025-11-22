
import { MarketCandle, Timeframe } from "../types";

const getTimeframeDetails = (tf: Timeframe): { duration: number, volatilityMult: number } => {
  switch (tf) {
    case '1m': return { duration: 60 * 1000, volatilityMult: 1 };
    case '15m': return { duration: 15 * 60 * 1000, volatilityMult: 3.5 }; // Adjusted for better realism
    case '1h': return { duration: 60 * 60 * 1000, volatilityMult: 7.0 };
    case '4h': return { duration: 4 * 60 * 60 * 1000, volatilityMult: 15.0 };
    case '1d': return { duration: 24 * 60 * 60 * 1000, volatilityMult: 30.0 };
    default: return { duration: 60 * 1000, volatilityMult: 1 };
  }
};

// Standard Geometric Brownian Motion-ish generator
export const generateNextCandle = (prev: MarketCandle, timeframe: Timeframe = '1m'): MarketCandle => {
  const { duration, volatilityMult } = getTimeframeDetails(timeframe);
  // Base volatility per minute
  const baseVolatility = 0.001; 
  const volatility = baseVolatility * Math.sqrt(volatilityMult); // Scale vol by sqrt of time approx

  const change = 1 + (Math.random() - 0.5) * volatility * 3; // Random walk
  const close = prev.close * change;
  
  // Simulate high/low based on close/open
  const open = prev.close;
  const high = Math.max(open, close) * (1 + Math.random() * (volatility * 0.5));
  const low = Math.min(open, close) * (1 - Math.random() * (volatility * 0.5));
  
  const timestamp = prev.timestamp + duration;
  const date = new Date(timestamp);
  
  // Format time string based on timeframe length
  let timeStr;
  if (timeframe === '1d' || timeframe === '4h') {
      timeStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:00`;
  } else {
      timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }

  return {
    symbol: prev.symbol,
    time: timeStr,
    timestamp,
    open,
    high,
    low,
    close,
    volume: Math.random() * 1000 * volatilityMult + 500
  };
};

export const generateInitialData = (symbol: string, price: number, count: number, timeframe: Timeframe = '1m'): MarketCandle[] => {
  const data: MarketCandle[] = [];
  let currentPrice = price;
  const now = Date.now();
  const { duration, volatilityMult } = getTimeframeDetails(timeframe);
  const baseVolatility = 0.001; 
  const volatility = baseVolatility * Math.sqrt(volatilityMult);

  for (let i = count; i > 0; i--) {
    const timestamp = now - i * duration;
    const date = new Date(timestamp);
    
    let timeStr;
    if (timeframe === '1d' || timeframe === '4h') {
        timeStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:00`;
    } else {
        timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    
    const open = currentPrice;
    const change = 1 + (Math.random() - 0.5) * volatility * 3;
    const close = open * change;
    const high = Math.max(open, close) * (1 + Math.random() * (volatility * 0.5));
    const low = Math.min(open, close) * (1 - Math.random() * (volatility * 0.5));

    data.push({
      symbol,
      time: timeStr,
      timestamp,
      open,
      high,
      low,
      close,
      volume: Math.random() * 1000 * volatilityMult + 500
    });
    currentPrice = close;
  }
  return data;
};
