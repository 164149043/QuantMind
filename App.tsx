
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
  Timeframe
} from './types';
import { generateInitialData, generateNextCandle } from './services/marketSimulator';
import { analyzeMarketCondition } from './services/geminiService';
import { BinanceService } from './services/binanceService';
import { getCompositeStrategySignal } from './services/strategyService';
import { ActivityIcon, SettingsIcon, PlayIcon, PauseIcon, BrainIcon } from './components/Icons';
import ChartComponent from './components/ChartComponent';
import LogPanel from './components/LogPanel';
import StatsPanel from './components/StatsPanel';
import PositionTable from './components/PositionTable';
import ConfigPanel from './components/ConfigPanel';

// Initial prices for simulation data before WebSocket connects
const INITIAL_PRICES = {
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
  // Initialize strategies with MA enabled by default
  activeStrategies: Object.values(StrategyType).map(type => ({
      type,
      enabled: type === StrategyType.MA_CROSSOVER,
      weight: 5 // Default weight middle ground
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
    martingalePriceDrop: 1.5, // 1.5% drop to buy more
    martingaleProfitTarget: 2.5, // 2.5% gain to close all
    martingaleVolumeMultiplier: 1.0
  },
  leverage: 10 // Default to 10x leverage
};

const formatPrice = (price: number) => {
  if (price < 10) return price.toFixed(4);
  return price.toFixed(2);
};

const App: React.FC = () => {
  // --- State ---
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_CONFIG);
  
  const [state, setState] = useState<SystemState>({
    balance: DEFAULT_CONFIG.initialCapital, // Realized Balance
    positions: [],
    marketData: {
      [CryptoCurrency.BTC]: generateInitialData(CryptoCurrency.BTC, INITIAL_PRICES.BTC, 200, '1m'),
      [CryptoCurrency.ETH]: generateInitialData(CryptoCurrency.ETH, INITIAL_PRICES.ETH, 200, '1m'),
      [CryptoCurrency.BNB]: generateInitialData(CryptoCurrency.BNB, INITIAL_PRICES.BNB, 200, '1m'),
      [CryptoCurrency.SOL]: generateInitialData(CryptoCurrency.SOL, INITIAL_PRICES.SOL, 200, '1m'),
      [CryptoCurrency.DOGE]: generateInitialData(CryptoCurrency.DOGE, INITIAL_PRICES.DOGE, 200, '1m'),
    },
    isLive: false,
    logs: [],
    currentPrices: INITIAL_PRICES
  });
  
  // --- Cache for Market Data ---
  // Stores history for different timeframes to prevent regeneration on switch
  const dataCache = useRef<Record<string, Record<string, MarketCandle[]>>>({});

  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'CONFIG'>('DASHBOARD');
  const [activeSymbol, setActiveSymbol] = useState<string>(CryptoCurrency.BTC); // Which chart to view
  const [aiThinking, setAiThinking] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // Services Refs
  const binanceService = useRef<BinanceService | null>(null);
  const stateRef = useRef(state);
  const configRef = useRef(config);
  
  useEffect(() => {
    stateRef.current = state;
    configRef.current = config;
  }, [state, config]);

  // Initialize Cache on Mount
  useEffect(() => {
    if (Object.keys(dataCache.current).length === 0) {
        dataCache.current[DEFAULT_CONFIG.timeframe] = state.marketData;
    }
  }, []);

  // Ensure activeSymbol is valid when config selectedAssets changes
  useEffect(() => {
    if (!config.selectedAssets.includes(activeSymbol as CryptoCurrency) && config.selectedAssets.length > 0) {
      setActiveSymbol(config.selectedAssets[0]);
    }
  }, [config.selectedAssets, activeSymbol]);

  // --- Logging Helper ---
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

  // --- Handle Manual Close Position ---
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

  // --- Handle Timeframe Switch ---
  const handleTimeframeChange = (newTf: Timeframe) => {
      if (newTf === config.timeframe) return;
      
      // 1. Sync current state to cache before switching away
      dataCache.current[config.timeframe] = {
          ...dataCache.current[config.timeframe],
          ...stateRef.current.marketData
      };

      // 2. Prepare new data from cache or generate if missing
      const cachedData = dataCache.current[newTf] || {};
      const nextMarketData: Record<string, MarketCandle[]> = { ...cachedData };
      
      // Check if we have data for all currently selected assets
      const currentP = stateRef.current.currentPrices;
      let hasGeneratedNewData = false;

      config.selectedAssets.forEach(asset => {
          // If asset missing in cache or empty, generate it
          if (!nextMarketData[asset] || nextMarketData[asset].length === 0) {
              nextMarketData[asset] = generateInitialData(
                  asset, 
                  currentP[asset] || INITIAL_PRICES[asset as CryptoCurrency], 
                  200, 
                  newTf
              );
              hasGeneratedNewData = true;
          }
      });

      // Update cache with complete dataset for this timeframe
      dataCache.current[newTf] = nextMarketData;

      // 3. Update State & Config
      setConfig(prev => ({ ...prev, timeframe: newTf }));
      setState(prev => ({
          ...prev,
          marketData: nextMarketData
      }));

      if (hasGeneratedNewData) {
         addLog(`切换 K 线周期至: ${newTf} (部分数据重新生成)`, "INFO");
      } else {
         addLog(`切换 K 线周期至: ${newTf} (加载缓存数据)`, "INFO");
      }
  };

  // --- Trading Execution Logic ---
  const processMarketTick = useCallback((candle: MarketCandle) => {
    const currentState = stateRef.current;
    const currentConfig = configRef.current;
    const symbol = candle.symbol;
    const tf = currentConfig.timeframe;

    // 1. Update Market Data & Cache
    const oldData = currentState.marketData[symbol] || [];
    const newData = [...oldData];
    
    const lastCandle = newData[newData.length - 1];
    if (lastCandle && lastCandle.timestamp === candle.timestamp) {
        newData[newData.length - 1] = candle;
    } else {
        newData.push(candle);
        if (newData.length > 400) newData.shift();
    }

    if (!dataCache.current[tf]) dataCache.current[tf] = {};
    dataCache.current[tf][symbol] = newData;
    
    const allMarketData = {
        ...currentState.marketData,
        [symbol]: newData
    };

    setState(prev => ({
        ...prev,
        currentPrices: { ...prev.currentPrices, [symbol]: candle.close },
        marketData: allMarketData
    }));

    if (!currentState.isLive) return;

    // 2. Calculate Global Account Metrics
    const activePositions = currentState.positions.filter(p => p.status === 'OPEN');
    const totalUnrealized = activePositions.reduce((sum, p) => {
        const curr = p.symbol === symbol ? candle.close : (currentState.currentPrices[p.symbol] || p.price);
        const diff = curr - p.price;
        return sum + (diff * p.amount * (p.type === 'BUY' ? 1 : -1));
    }, 0);

    const totalUsedMargin = activePositions.reduce((sum, p) => sum + ((p.price * p.amount) / (p.leverage || 1)), 0);
    const equity = currentState.balance + totalUnrealized;
    const availableMargin = equity - totalUsedMargin;

    // 3. Composite Strategy Check
    const existingSymbolPositions = activePositions.filter(p => p.symbol === symbol);
    
    const { signal, score, breakdown } = getCompositeStrategySignal(
        currentConfig.activeStrategies,
        newData,
        activePositions,
        allMarketData,
        currentConfig.strategyParams
    );
    
    // Determine if Martingale is active in the mix (affects sizing logic)
    const isMartingaleActive = currentConfig.activeStrategies.some(s => s.type === StrategyType.MARTINGALE && s.enabled);
    
    // Logic:
    // If Score > Threshold -> BUY
    // If Score < -Threshold -> SELL
    // However, if we already have positions, we need to check if we should add or close.
    
    // Entry Logic
    if (existingSymbolPositions.length === 0 || (isMartingaleActive && signal === 'BUY')) {
         let riskFactor = currentConfig.riskLevel === RiskLevel.HIGH ? 0.30 : (currentConfig.riskLevel === RiskLevel.MEDIUM ? 0.15 : 0.10);
         
         if (isMartingaleActive && existingSymbolPositions.length > 0) {
            const mult = currentConfig.strategyParams.martingaleVolumeMultiplier || 1.0; 
            riskFactor = riskFactor * Math.pow(mult, existingSymbolPositions.length);
         }

         const tradeMargin = currentConfig.initialCapital * riskFactor;
         const leverage = currentConfig.leverage || 1;
         const positionSizeUSD = tradeMargin * leverage;
         
         if (availableMargin < tradeMargin && signal === 'BUY') {
             addLog(`[${symbol}] 可用保证金不足 ($${availableMargin.toFixed(2)} < $${tradeMargin.toFixed(2)})，无法开仓`, 'WARNING');
             return; 
         }

         const amount = positionSizeUSD / candle.close;

         // Only trade if we have a strong composite signal
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
                strategy: 'COMPOSITE'
            };
            
            const signalsStr = breakdown.map(b => `${b.type.split('_')[0]}:${b.signal}`).join(', ');
            const msg = existingSymbolPositions.length > 0 
                ? `[${symbol}] 组合补仓 (Score ${score.toFixed(2)}) @ ${formatPrice(candle.close)} | ${signalsStr}`
                : `[${symbol}] 组合开多 (Score ${score.toFixed(2)}) @ ${formatPrice(candle.close)} | ${signalsStr}`;
            
            addLog(msg, 'TRADE');
            setState(prev => ({ 
                ...prev, 
                positions: [...prev.positions, trade], 
                balance: prev.balance 
            }));
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
                strategy: 'COMPOSITE'
            };
            const signalsStr = breakdown.map(b => `${b.type.split('_')[0]}:${b.signal}`).join(', ');
            addLog(`[${symbol}] 组合开空 (Score ${score.toFixed(2)}) @ ${formatPrice(candle.close)} | ${signalsStr}`, 'TRADE');
            setState(prev => ({ 
                ...prev, 
                positions: [...prev.positions, trade],
                balance: prev.balance
            }));
         }
    }

    // Exit Logic
    if (existingSymbolPositions.length > 0) {
        let shouldClose = false;
        // Standard exit: Reverse signal closes trade
        // Martingale exit: If Martingale is part of the mix, it might return SELL when profit target hit.
        
        // Simple composite exit logic:
        // Longs open: Close if Signal is SELL
        // Shorts open: Close if Signal is BUY
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

  // --- Initialize Binance Connection ---
  useEffect(() => {
    setIsSimulating(false);
    const service = new BinanceService();
    service.connect(config.selectedAssets, config.timeframe, config.binanceApiKey, () => {
        addLog("连接 Binance 实盘网络失败 (可能受地区限制)，已自动切换至模拟数据生成模式。", "WARNING");
        setIsSimulating(true);
    });
    binanceService.current = service;
    const unsubscribe = service.subscribe(processMarketTick);
    return () => {
        unsubscribe();
        service.disconnect();
    };
  }, [processMarketTick, config.selectedAssets, config.timeframe, config.binanceApiKey, addLog]);

  // --- Simulation Loop ---
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


  // --- AI Analysis Action ---
  const handleAIAnalysis = async () => {
    if (!process.env.API_KEY) {
      addLog("无法执行 AI 分析: 环境变量中缺少 API Key", "ERROR");
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

  // --- UI Handlers ---
  const toggleSystem = () => {
    setState(prev => ({ ...prev, isLive: !prev.isLive }));
    addLog(state.isLive ? "系统已暂停自动交易" : "系统已启动自动交易 (组合策略模式)", "INFO");
  };

  const resetSystem = () => {
    setState(prev => ({
      ...prev,
      balance: config.initialCapital,
      positions: [],
      logs: [],
      isLive: false
    }));
    addLog("账户状态已重置", "WARNING");
  };

  const riskLabelMap = {
      [RiskLevel.LOW]: '保守 (Low)',
      [RiskLevel.MEDIUM]: '稳健 (Medium)',
      [RiskLevel.HIGH]: '激进 (High)'
  };

  const activePositions = state.positions.filter(p => p.status === 'OPEN');
  const totalUnrealizedPnl = activePositions.reduce((acc, p) => {
      const currentPrice = state.currentPrices[p.symbol] || p.price;
      const diff = currentPrice - p.price;
      const pnl = diff * p.amount * (p.type === 'BUY' ? 1 : -1);
      return acc + pnl;
  }, 0);
  
  const totalEquity = state.balance + totalUnrealizedPnl;
  const timeframes: Timeframe[] = ['1m', '15m', '1h', '4h', '1d'];
  const activeStrategiesCount = config.activeStrategies.filter(s => s.enabled).length;

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
            实盘监控
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
            onConfigChange={setConfig} 
            onClose={() => setActiveTab('DASHBOARD')} 
          />
        ) : (
          <>
            {/* Stats Row */}
            <StatsPanel 
              balance={totalEquity} 
              initialCapital={config.initialCapital} 
              openPositions={activePositions} 
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow min-h-0 mb-6">
              {/* Left: Chart */}
              <div className="lg:col-span-2 flex flex-col gap-4 min-h-[400px]">
                
                {/* Controls: Asset Tabs & Timeframes */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-crypto-panel rounded-lg p-2 border border-gray-800">
                   {/* Asset Selector */}
                   <div className="flex overflow-x-auto gap-1 no-scrollbar w-full sm:w-auto">
                    {config.selectedAssets.map(asset => (
                      <button
                        key={asset}
                        onClick={() => setActiveSymbol(asset)}
                        className={`px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap transition-colors ${activeSymbol === asset ? 'bg-[#2A2E39] text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
                      >
                        {asset} <span className={state.currentPrices[asset] > 0 ? "text-crypto-accent" : "text-gray-600"}>${formatPrice(state.currentPrices[asset] || 0)}</span>
                      </button>
                    ))}
                  </div>

                  {/* Timeframe Selector */}
                  <div className="flex bg-black/30 rounded p-1 gap-1">
                    {timeframes.map(tf => (
                      <button
                        key={tf}
                        onClick={() => handleTimeframeChange(tf)}
                        className={`px-2 py-1 rounded text-xs font-bold font-mono transition-all ${
                          config.timeframe === tf 
                          ? 'bg-crypto-accent text-white' 
                          : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {tf.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <ChartComponent data={state.marketData[activeSymbol] || []} symbol={activeSymbol} />
                
                {/* Controls Bar */}
                <div className="bg-crypto-panel border border-gray-800 rounded-lg p-4 flex flex-wrap items-center gap-4">
                   <button 
                    onClick={toggleSystem}
                    className={`flex items-center gap-2 px-6 py-2 rounded font-bold transition-all ${state.isLive ? 'bg-yellow-600 hover:bg-yellow-500 text-white' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                   >
                     {state.isLive ? <PauseIcon className="w-4 h-4"/> : <PlayIcon className="w-4 h-4"/>}
                     {state.isLive ? '停止策略运行' : '启动组合交易'}
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
                     {aiThinking ? '分析当前币种' : `AI 分析 ${activeSymbol}`}
                   </button>
                </div>
              </div>

              {/* Right: Logs & Strategy Info */}
              <div className="flex flex-col gap-4 min-h-[400px]">
                <div className="bg-crypto-panel border border-gray-800 rounded-lg p-4">
                  <h3 className="text-crypto-text font-bold text-sm mb-3 uppercase tracking-wider">当前环境</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">K线周期</span>
                      <span className="text-white font-bold font-mono">{config.timeframe.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">运行模式</span>
                      <span className="text-crypto-accent font-bold">多策略组合 ({activeStrategiesCount})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">杠杆倍数</span>
                      <span className="text-yellow-400 font-bold font-mono">{config.leverage || 1}x</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">风控等级</span>
                      <span className={`font-mono px-2 py-0.5 rounded text-xs ${config.riskLevel === RiskLevel.HIGH ? 'bg-red-900/50 text-red-400' : 'bg-blue-900/50 text-blue-400'}`}>
                        {riskLabelMap[config.riskLevel]}
                      </span>
                    </div>
                  </div>
                </div>

                <LogPanel 
                  logs={state.logs} 
                  onClear={() => setState(prev => ({ ...prev, logs: [] }))} 
                />
              </div>
            </div>

            {/* Bottom: Positions Table */}
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
