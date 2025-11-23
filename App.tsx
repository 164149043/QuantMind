
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  SystemConfig, 
  SystemState, 
  CryptoCurrency, 
  RiskLevel, 
  LogEntry, 
  Trade,
  StrategyType,
  MarketCandle,
  CompositeAnalysisResult
} from './types';
import { generateInitialData, generateNextCandle } from './services/marketSimulator';
import { analyzeMarketCondition } from './services/geminiService';
import { BinanceService } from './services/binanceService';
import { getCompositeStrategySignal } from './services/strategyService';
import { ActivityIcon, SettingsIcon, PlayIcon, PauseIcon, BrainIcon } from './components/Icons';
import { StrategyMonitor } from './components/StrategyMonitor';
import LogPanel from './components/LogPanel';
import StatsPanel from './components/StatsPanel';
import PositionTable from './components/PositionTable';
import ConfigPanel from './components/ConfigPanel';

// Storage Keys
const STORAGE_KEY_CONFIG = 'quantmind_config_v1';
const STORAGE_KEY_STATE = 'quantmind_state_v1';

// Initial prices for simulation data before WebSocket connects
// Used only if no local storage is found
const DEFAULT_INITIAL_PRICES = {
  [CryptoCurrency.BTC]: 96000,
  [CryptoCurrency.ETH]: 2650,
  [CryptoCurrency.BNB]: 610,
  [CryptoCurrency.SOL]: 150,
  [CryptoCurrency.DOGE]: 0.3650
};

// Default Config
const DEFAULT_CONFIG: SystemConfig = {
  apiKey: '',
  binanceApiKey: '',
  initialCapital: 10000,
  riskLevel: RiskLevel.MEDIUM,
  selectedAssets: [
    CryptoCurrency.BTC, 
    CryptoCurrency.ETH, 
    CryptoCurrency.BNB, 
    CryptoCurrency.SOL, 
    CryptoCurrency.DOGE
  ],
  activeStrategies: Object.values(StrategyType).map(type => ({
      type,
      enabled: [StrategyType.MA_CROSSOVER, StrategyType.RSI_REVERSION, StrategyType.MACD_TREND].includes(type),
      weight: 5
  })),
  timeframe: '1m',
  strategyParams: {
    fastPeriod: 7,
    slowPeriod: 25,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    bbPeriod: 20,
    bbStdDev: 2,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    martingalePriceDrop: 1.5, 
    martingaleProfitTarget: 2.5, 
    martingaleVolumeMultiplier: 1.0
  },
  leverage: 10 
};

const formatPrice = (price: number) => {
  if (price < 10) return price.toFixed(4);
  return price.toFixed(2);
};

// Safe API Key retrieval
const getEnvApiKey = () => {
  return process.env.API_KEY || '';
};

const App: React.FC = () => {
  // --- State Initialization with Persistence ---
  
  // 1. Load Config
  const [config, setConfig] = useState<SystemConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (saved) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error("Failed to load config", e);
    }
    return DEFAULT_CONFIG;
  });
  
  // 2. Load Core State (Balance, Positions, etc) & Generate Market Data
  const [state, setState] = useState<SystemState>(() => {
    let savedState: Partial<SystemState> | null = null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STATE);
      if (saved) {
        savedState = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load state", e);
    }

    // Determine starting prices: Saved prices OR Default prices
    const startPrices = savedState?.currentPrices || DEFAULT_INITIAL_PRICES;

    // Generate initial market data based on startPrices to ensure continuity
    const initialMarketData: Record<string, MarketCandle[]> = {};
    const assets = Object.values(CryptoCurrency) as string[];
    
    assets.forEach(symbol => {
      // If we have a saved price, generate history ending at that price
      const price = startPrices[symbol] || DEFAULT_INITIAL_PRICES[symbol as CryptoCurrency] || 100;
      initialMarketData[symbol] = generateInitialData(symbol, price, 150, '1m');
    });

    if (savedState) {
      return {
        balance: savedState.balance ?? DEFAULT_CONFIG.initialCapital,
        positions: savedState.positions || [],
        marketData: initialMarketData,
        isLive: false, // Always start paused
        logs: savedState.logs || [],
        currentPrices: startPrices
      };
    } else {
      return {
        balance: DEFAULT_CONFIG.initialCapital, 
        positions: [],
        marketData: initialMarketData,
        isLive: false,
        logs: [],
        currentPrices: DEFAULT_INITIAL_PRICES
      };
    }
  });

  // State for Visualization
  const [latestAnalysis, setLatestAnalysis] = useState<Record<string, CompositeAnalysisResult>>({});
  
  const dataCache = useRef<Record<string, Record<string, MarketCandle[]>>>({});

  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'CONFIG'>('DASHBOARD');
  const [activeSymbol, setActiveSymbol] = useState<string>(CryptoCurrency.BTC); 
  const [aiThinking, setAiThinking] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  const binanceService = useRef<BinanceService | null>(null);
  const stateRef = useRef(state);
  const configRef = useRef(config);
  // Ref to prevent saving to localStorage during reset process
  const isResettingRef = useRef(false); 
  
  // Update Refs
  useEffect(() => {
    stateRef.current = state;
    configRef.current = config;
  }, [state, config]);

  // --- Persistence Effects ---

  // Save Config on change
  useEffect(() => {
    if (isResettingRef.current) return;
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  }, [config]);

  // Save State (Throttled) on change
  useEffect(() => {
    if (isResettingRef.current) return;
    // We do NOT save marketData to localStorage as it is too large.
    // We save currentPrices, balance, positions, and logs.
    const stateToSave = {
      balance: state.balance,
      positions: state.positions,
      logs: state.logs.slice(-50), // Keep last 50 logs only to save space
      currentPrices: state.currentPrices
    };
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(stateToSave));
  }, [state.balance, state.positions, state.logs, state.currentPrices]);


  useEffect(() => {
    if (Object.keys(dataCache.current).length === 0) {
        dataCache.current[DEFAULT_CONFIG.timeframe] = state.marketData;
    }
  }, []);

  useEffect(() => {
    if (!config.selectedAssets.includes(activeSymbol as CryptoCurrency) && config.selectedAssets.length > 0) {
      setActiveSymbol(config.selectedAssets[0]);
    }
  }, [config.selectedAssets, activeSymbol]);

  const addLog = useCallback((message: string, level: LogEntry['level'] = 'INFO') => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        level,
        message
      }]
    }));
  }, []);

  // Handle Config Changes (Sync Balance if Capital Changes)
  const handleConfigChange = (newConfig: SystemConfig) => {
    // If the user changes the initial capital, we should sync the current balance to match
    // otherwise the dashboard PnL calculation (Balance - Initial) will be incorrect.
    if (newConfig.initialCapital !== config.initialCapital) {
      setState(prev => ({
        ...prev,
        balance: newConfig.initialCapital
      }));
      addLog(`配置已更新: 账户本金重置为 $${newConfig.initialCapital}`, 'INFO');
    }
    setConfig(newConfig);
  };

  const handleManualClose = (tradeId: string) => {
    const trade = state.positions.find(p => p.id === tradeId);
    if (!trade) return;

    const currentPrice = state.currentPrices[trade.symbol] || trade.price;
    const pnl = (currentPrice - trade.price) * trade.amount * (trade.type === 'BUY' ? 1 : -1);
    
    addLog(`[${trade.symbol}] 用户手动市价平仓. 最终盈亏: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`, pnl >= 0 ? 'TRADE' : 'WARNING');
    
    setState(prev => ({
        ...prev,
        balance: prev.balance + pnl,
        positions: prev.positions.map(p => 
            p.id === tradeId 
            ? { ...p, status: 'CLOSED', pnl, unrealizedPnl: 0 } 
            : p
        )
    }));
  };

  const processMarketTick = useCallback((candle: MarketCandle) => {
    const currentState = stateRef.current;
    const currentConfig = configRef.current;
    const symbol = candle.symbol;
    const tf = currentConfig.timeframe;

    // 1. Update Market Data
    const oldData = currentState.marketData[symbol] || [];
    const newData = [...oldData];
    const lastCandle = newData[newData.length - 1];
    
    // Basic de-duplication based on timestamp
    if (lastCandle && lastCandle.timestamp === candle.timestamp) {
        newData[newData.length - 1] = candle;
    } else {
        newData.push(candle);
        if (newData.length > 400) newData.shift();
    }
    if (!dataCache.current[tf]) dataCache.current[tf] = {};
    dataCache.current[tf][symbol] = newData;
    
    const allMarketData = { ...currentState.marketData, [symbol]: newData };

    setState(prev => ({
        ...prev,
        currentPrices: { ...prev.currentPrices, [symbol]: candle.close },
        marketData: allMarketData
    }));

    // 2. Run Analysis (Always run to update dashboard, even if not live trading)
    const activePositions = currentState.positions.filter(p => p.status === 'OPEN');
    
    // Calculate full analysis result with auto-tuning
    const analysisResult = getCompositeStrategySignal(
        currentConfig.activeStrategies,
        newData,
        activePositions,
        allMarketData,
        currentConfig.strategyParams
    );
    
    // Update local state for dashboard visualization
    setLatestAnalysis(prev => ({ ...prev, [symbol]: analysisResult }));

    if (!currentState.isLive) return;

    // 3. Trading Execution Logic
    const { signal, score } = analysisResult;
    const existingSymbolPositions = activePositions.filter(p => p.symbol === symbol);
    
    // Only process signals if confidence is high (score)
    const activeStrategies = currentConfig.activeStrategies.filter(s => s.enabled);
    const isMartingaleActive = activeStrategies.some(s => s.type === StrategyType.MARTINGALE);

    // Entry Logic
    if (existingSymbolPositions.length === 0 || (isMartingaleActive && signal === 'BUY')) {
         const totalUsedMargin = activePositions.reduce((sum, p) => sum + ((p.price * p.amount) / (p.leverage || 1)), 0);
         const totalUnrealized = activePositions.reduce((sum, p) => {
            const curr = p.symbol === symbol ? candle.close : (currentState.currentPrices[p.symbol] || p.price);
            return sum + ((curr - p.price) * p.amount * (p.type === 'BUY' ? 1 : -1));
         }, 0);
         const equity = currentState.balance + totalUnrealized;
         const availableMargin = equity - totalUsedMargin;

         let riskFactor = currentConfig.riskLevel === RiskLevel.HIGH ? 0.30 : (currentConfig.riskLevel === RiskLevel.MEDIUM ? 0.15 : 0.10);
         if (isMartingaleActive && existingSymbolPositions.length > 0) {
             const mult = currentConfig.strategyParams.martingaleVolumeMultiplier || 1.0; 
            riskFactor = riskFactor * Math.pow(mult, existingSymbolPositions.length);
         }

         const tradeMargin = currentConfig.initialCapital * riskFactor;
         const leverage = currentConfig.leverage || 1;
         const positionSizeUSD = tradeMargin * leverage;
         
         if (availableMargin < tradeMargin && signal === 'BUY') return;

         const amount = positionSizeUSD / candle.close;

         if (signal === 'BUY') {
            const trade: Trade = {
                id: Math.random().toString(36),
                symbol,
                type: 'BUY',
                price: candle.close,
                amount,
                leverage,
                timestamp: Date.now(),
                status: 'OPEN',
                strategy: 'AUTO'
            };
            const msg = existingSymbolPositions.length > 0 
                ? `[${symbol}] 组合补仓 (Score ${score.toFixed(2)}) @ ${formatPrice(candle.close)}`
                : `[${symbol}] 组合开多 (Score ${score.toFixed(2)}) @ ${formatPrice(candle.close)}`;
            addLog(msg, 'TRADE');
            setState(prev => ({ ...prev, positions: [...prev.positions, trade] }));
         } else if (signal === 'SELL' && existingSymbolPositions.length === 0) {
             const trade: Trade = {
                id: Math.random().toString(36),
                symbol,
                type: 'SELL',
                price: candle.close,
                amount,
                leverage,
                timestamp: Date.now(),
                status: 'OPEN',
                strategy: 'AUTO'
            };
            addLog(`[${symbol}] 组合开空 (Score ${score.toFixed(2)}) @ ${formatPrice(candle.close)}`, 'TRADE');
            setState(prev => ({ ...prev, positions: [...prev.positions, trade] }));
         }
    }

    // Exit Logic
    if (existingSymbolPositions.length > 0) {
        let shouldClose = false;
        const isLong = existingSymbolPositions[0].type === 'BUY';
        if (isLong && signal === 'SELL') shouldClose = true;
        if (!isLong && signal === 'BUY') shouldClose = true;

        if (shouldClose) {
            let totalPnl = 0;
            const closedPositionsIds: string[] = [];
            existingSymbolPositions.forEach(pos => {
                const pnl = (candle.close - pos.price) * pos.amount * (pos.type === 'BUY' ? 1 : -1);
                totalPnl += pnl;
                closedPositionsIds.push(pos.id);
            });
            const actionType = totalPnl > 0 ? '止盈' : '止损';
            addLog(`[${symbol}] 组合${actionType}平仓 (Score ${score.toFixed(2)}). 总盈亏: $${totalPnl.toFixed(2)}`, totalPnl > 0 ? 'TRADE' : 'WARNING');
            setState(prev => ({
                ...prev,
                positions: prev.positions.map(p => closedPositionsIds.includes(p.id) ? { ...p, status: 'CLOSED', pnl: (candle.close - p.price) * p.amount * (p.type === 'BUY' ? 1 : -1), unrealizedPnl: 0 } : p),
                balance: prev.balance + totalPnl
            }));
        }
    }

  }, [addLog]);

  useEffect(() => {
    setIsSimulating(false);
    const service = new BinanceService();
    service.connect(config.selectedAssets, config.timeframe, config.binanceApiKey, () => {
        addLog("连接 Binance 实盘网络失败，已自动切换至模拟数据生成模式。", "WARNING");
        setIsSimulating(true);
    });
    binanceService.current = service;
    const unsubscribe = service.subscribe(processMarketTick);
    return () => {
        unsubscribe();
        service.disconnect();
    };
  }, [processMarketTick, config.selectedAssets, config.timeframe, config.binanceApiKey, addLog]);

  useEffect(() => {
    if (!isSimulating) return;
    const interval = setInterval(() => {
        config.selectedAssets.forEach(symbol => {
            const currentData = stateRef.current.marketData[symbol];
            const lastCandle = currentData[currentData.length - 1];
            if (lastCandle) {
                const next = generateNextCandle(lastCandle, config.timeframe);
                processMarketTick(next);
            }
        });
    }, 1000);
    return () => clearInterval(interval);
  }, [isSimulating, config.selectedAssets, config.timeframe, processMarketTick]);

  const handleAIAnalysis = async () => {
    const apiKey = getEnvApiKey();
    if (!apiKey) {
      addLog("无法执行 AI 分析: 缺少 API Key。请在 .env 中配置 API_KEY。", "ERROR");
      return;
    }
    setAiThinking(true);
    addLog(`AI 智能体正在分析 ${activeSymbol} 市场结构...`, "AI");
    
    const activeStrategiesDesc = config.activeStrategies
        .filter(s => s.enabled)
        .map(s => `${s.type}(W:${s.weight})`)
        .join(', ');

    const candles = state.marketData[activeSymbol] || [];
    
    const analysis = await analyzeMarketCondition(
      activeSymbol, 
      candles, 
      config.riskLevel, 
      state.positions.filter(p => p.status === 'OPEN' && p.symbol === activeSymbol),
      config.initialCapital,
      activeStrategiesDesc || "No Active Strategy"
    );

    const signalMap = { 'BUY': '建议买入', 'SELL': '建议卖出', 'HOLD': '建议观望' };
    addLog(`[${activeSymbol}] AI 分析: ${signalMap[analysis.signal]} (置信度: ${analysis.confidence}%).`, "AI");
    addLog(`逻辑: ${analysis.reasoning}`, "INFO");
    setAiThinking(false);
  };

  const toggleSystem = () => {
    setState(prev => ({ ...prev, isLive: !prev.isLive }));
    addLog(state.isLive ? "系统已暂停自动交易" : "系统已启动自动交易 (组合策略模式)", "INFO");
  };

  const resetSystem = () => {
    const confirmed = window.confirm("⚠️ 警告：确定要重置系统吗？\n\n此操作将：\n1. 清空所有持仓和交易记录\n2. 恢复默认资金\n3. 清除所有自定义策略配置\n4. 强制刷新页面");
    
    if (confirmed) {
        // 1. Set guard flag to prevent any pending useEffects from saving old data
        isResettingRef.current = true;

        // 2. Clear Local Storage
        localStorage.removeItem(STORAGE_KEY_CONFIG);
        localStorage.removeItem(STORAGE_KEY_STATE);

        // 3. Force reload to ensure a completely clean state, resetting all Refs and Intervals
        // Use setTimeout to allow the browser to process the storage clear event
        setTimeout(() => {
             window.location.reload();
        }, 100);
    }
  };

  const activePositions = state.positions.filter(p => p.status === 'OPEN');
  const totalUnrealizedPnl = activePositions.reduce((acc, p) => {
      const currentPrice = state.currentPrices[p.symbol] || p.price;
      const diff = currentPrice - p.price;
      const pnl = diff * p.amount * (p.type === 'BUY' ? 1 : -1);
      return acc + pnl;
  }, 0);
  const totalEquity = state.balance + totalUnrealizedPnl;
  
  const currentAnalysis = latestAnalysis[activeSymbol] || { 
      signal: 'NEUTRAL', 
      score: 0, 
      regime: { type: 'RANGING', volatility: 0, trendStrength: 0, description: 'Initializing...' }, 
      insights: [] 
  };

  return (
    <div className="min-h-screen bg-crypto-dark text-crypto-text font-sans selection:bg-crypto-accent selection:text-white flex flex-col">
      {/* Header */}
      <header className="bg-crypto-panel border-b border-gray-800 p-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
            <ActivityIcon className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white">QuantMind <span className="text-crypto-accent">智脑量化</span> <span className="text-xs bg-green-900 text-green-200 px-1 py-0.5 rounded font-mono ml-1">PRO</span></h1>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveTab('DASHBOARD')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'DASHBOARD' ? 'bg-[#2A2E39] text-white' : 'text-gray-400 hover:text-white'}`}
          >
            策略监控
          </button>
          <button 
             onClick={() => setActiveTab('CONFIG')}
             className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'CONFIG' ? 'bg-[#2A2E39] text-white' : 'text-gray-400 hover:text-white'}`}
          >
            <SettingsIcon className="w-4 h-4" /> 全局配置
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-4 md:p-6 overflow-hidden flex flex-col">
        {activeTab === 'CONFIG' ? (
          <ConfigPanel 
            config={config} 
            onConfigChange={handleConfigChange} 
            onClose={() => setActiveTab('DASHBOARD')} 
          />
        ) : (
          <>
            <StatsPanel 
              balance={totalEquity} 
              initialCapital={config.initialCapital} 
              openPositions={activePositions} 
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow min-h-0 mb-6">
              {/* Left: Strategy Monitor (Replaces Chart) */}
              <div className="lg:col-span-2 flex flex-col gap-4 min-h-[400px]">
                
                {/* Controls */}
                <div className="bg-crypto-panel rounded-lg p-2 border border-gray-800">
                   <div className="flex overflow-x-auto gap-1 no-scrollbar w-full">
                    {config.selectedAssets.map(asset => (
                      <button
                        key={asset}
                        onClick={() => setActiveSymbol(asset)}
                        className={`px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap transition-colors ${activeSymbol === asset ? 'bg-[#2A2E39] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
                      >
                        {asset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Main Monitor Component */}
                <StrategyMonitor 
                  symbol={activeSymbol}
                  price={state.currentPrices[activeSymbol] || 0}
                  analysis={currentAnalysis}
                />
                
                {/* Action Bar */}
                <div className="bg-crypto-panel border border-gray-800 rounded-lg p-4 flex flex-wrap items-center gap-4">
                   <button 
                    onClick={toggleSystem}
                    className={`flex items-center gap-2 px-6 py-2 rounded font-bold transition-all ${state.isLive ? 'bg-yellow-600 hover:bg-yellow-500 text-white' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                   >
                     {state.isLive ? <PauseIcon className="w-4 h-4"/> : <PlayIcon className="w-4 h-4"/>}
                     {state.isLive ? '停止自动执行' : '启动自动执行'}
                   </button>
                   <button 
                    onClick={resetSystem}
                    className="px-4 py-2 rounded border border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                   >
                     重置账户
                   </button>
                   <div className="h-8 w-px bg-gray-700 mx-2 hidden sm:block"></div>
                   <div className="flex items-center gap-2 text-xs text-gray-500 font-mono border border-gray-800 px-2 py-1 rounded">
                     <div className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
                     {isSimulating ? '模拟数据源' : 'Binance 实盘'}
                   </div>
                   <div className="flex-grow"></div>
                   <button 
                    onClick={handleAIAnalysis}
                    disabled={aiThinking}
                    className="flex items-center gap-2 px-4 py-2 rounded bg-purple-900/50 border border-purple-500/50 text-purple-300 hover:bg-purple-900 hover:border-purple-400 transition-all disabled:opacity-50"
                   >
                     <BrainIcon className={`w-4 h-4 ${aiThinking ? 'animate-pulse' : ''}`}/>
                     {aiThinking ? '深度分析' : `AI 深度分析`}
                   </button>
                </div>
              </div>

              {/* Right: Logs */}
              <div className="flex flex-col gap-4 min-h-[400px]">
                <LogPanel 
                  logs={state.logs} 
                  onClear={() => setState(prev => ({ ...prev, logs: [] }))} 
                />
              </div>
            </div>

            <div className="mb-6">
                <PositionTable 
                  positions={activePositions} 
                  currentPrices={state.currentPrices} 
                  onClosePosition={handleManualClose}
                />
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default App;
