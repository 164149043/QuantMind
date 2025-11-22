
import { MarketCandle, CryptoCurrency, Timeframe } from "../types";

type CandleCallback = (candle: MarketCandle) => void;

export class BinanceService {
  private ws: WebSocket | null = null;
  private subscribers: CandleCallback[] = [];
  
  // Map Binance symbol (BTCUSDT) to our Enum (BTC)
  private getSymbolKey(binanceSymbol: string): string {
    // binanceSymbol is "BTCUSDT"
    return binanceSymbol.replace('USDT', '').toUpperCase(); 
  }

  connect(assets: CryptoCurrency[], timeframe: Timeframe, apiKey?: string, onError?: () => void) {
    // Clean up existing connection if any
    if (this.ws) {
        this.disconnect();
    }

    if (assets.length === 0) return;

    // Log usage of API key if provided (mock usage for now as streams are public)
    if (apiKey) {
        console.log(`[BinanceService] Configured with API Key: ${apiKey.substring(0, 4)}*** (Ready for authenticated endpoints)`);
    }

    // Format: <symbol>@kline_<interval>
    const streams = assets.map(asset => `${asset.toLowerCase()}usdt@kline_${timeframe}`).join('/');
    
    // Use Spot API on port 443 (standard HTTPS port) to minimize firewall/region blocking issues.
    const url = `wss://stream.binance.com:443/stream?streams=${streams}`;
    
    console.log(`Connecting to Binance Streams: ${streams}`);
    
    try {
        this.ws = new WebSocket(url);
    } catch (e) {
        console.error("Failed to create WebSocket:", e);
        if (onError) onError();
        return;
    }

    this.ws.onopen = () => {
      console.log(`已连接到 Binance WebSocket (${timeframe})`);
    };

    this.ws.onmessage = (event) => {
      try {
          const message = JSON.parse(event.data);
          
          // Combined stream format: { stream: "...", data: { ... } }
          if (message.data && message.data.e === 'kline') {
            const k = message.data.k;
            const symbolKey = this.getSymbolKey(k.s); // k.s is "BTCUSDT"
            
            const date = new Date(k.t);
            // Adjust time format based on interval length roughly
            let timeStr;
            if (timeframe === '1d' || timeframe === '4h') {
                timeStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:00`;
            } else {
                timeStr = date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
            }

            const candle: MarketCandle = {
              symbol: symbolKey,
              time: timeStr,
              timestamp: k.t,
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v),
              isFinal: k.x // true if candle is closed
            };
            
            this.notifySubscribers(candle);
          }
      } catch (e) {
          console.error("Error parsing WS data:", e);
      }
    };

    this.ws.onerror = () => {
      console.error('Binance WS Error: Connection failed. Switching to simulation.');
      if (onError) onError();
    };

    this.ws.onclose = () => {
      console.log('Binance WS Closed');
    };
  }

  subscribe(callback: CandleCallback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  private notifySubscribers(candle: MarketCandle) {
    this.subscribers.forEach(cb => cb(candle));
  }

  disconnect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
