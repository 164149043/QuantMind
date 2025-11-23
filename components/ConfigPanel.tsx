
import React, { useState } from 'react';
import { SystemConfig, StrategyType, RiskLevel, CryptoCurrency, StrategyConfigItem } from '../types';

interface Props {
  config: SystemConfig;
  onConfigChange: (newConfig: SystemConfig) => void;
  onClose: () => void;
}

const strategyLabelMap: Record<StrategyType, string> = {
  [StrategyType.MA_CROSSOVER]: 'MA 双均线交叉',
  [StrategyType.RSI_REVERSION]: 'RSI 均值回归',
  [StrategyType.BOLLINGER_BREAKOUT]: '布林带突破',
  [StrategyType.MACD_TREND]: 'MACD 趋势跟踪',
  [StrategyType.EMA_CROSSOVER]: 'EMA 双均线交叉',
  [StrategyType.MARTINGALE]: '马丁格尔 (DCA 网格)',
  [StrategyType.ARBITRAGE]: '趋势相关性套利'
};

const strategyInfoMap: Record<StrategyType, { desc: string; usage: string }> = {
  [StrategyType.MA_CROSSOVER]: {
    desc: "利用短期均线(快线)上穿或下穿长期均线(慢线)来判断趋势的形成。金叉买入，死叉卖出。",
    usage: "✅ 适用: 单边大趋势行情。\n❌ 忌讳: 横盘震荡 (频繁止损磨损本金)。"
  },
  [StrategyType.EMA_CROSSOVER]: {
    desc: "原理同 MA，但 EMA 对近期价格权重更高，信号比普通 MA 更灵敏，能更早入场。",
    usage: "✅ 适用: 波动较快的趋势行情。\n❌ 忌讳: 极度无序的震荡市。"
  },
  [StrategyType.RSI_REVERSION]: {
    desc: "基于“物极必反”原理。RSI 高于超买阈值(如70)时看空，低于超卖阈值(如30)时看多。",
    usage: "✅ 适用: 箱体震荡、横盘整理行情。\n❌ 忌讳: 强烈的单边暴涨暴跌 (会过早摸顶抄底)。"
  },
  [StrategyType.BOLLINGER_BREAKOUT]: {
    desc: "当价格突破布林带上轨时视为强势多头信号；跌破下轨时视为空头信号。利用波动率放大进行交易。",
    usage: "✅ 适用: 盘整后的突破行情。\n❌ 忌讳: 缩量窄幅震荡。"
  },
  [StrategyType.MACD_TREND]: {
    desc: "利用快慢均线的聚合与分离(DIF/DEA)及柱状图来判断中长期动能方向。",
    usage: "✅ 适用: 中长线趋势判断，过滤假信号能力强。\n❌ 忌讳: 超短线高频交易。"
  },
  [StrategyType.MARTINGALE]: {
    desc: "逆势策略。亏损时按比例加仓摊低成本，一旦价格回调即可获利离场。",
    usage: "✅ 适用: 有底部的震荡行情。\n⚠️ 风险: 必须严格控制仓位，单边行情可能导致爆仓。"
  },
  [StrategyType.ARBITRAGE]: {
    desc: "利用相关资产(如 BTC/ETH)的价差回归进行套利。当前版本仅为模拟逻辑。",
    usage: "✅ 适用: 市场非理性波动时。"
  }
};

const riskLabelMap: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: '保守 (Low)',
  [RiskLevel.MEDIUM]: '稳健 (Medium)',
  [RiskLevel.HIGH]: '激进 (High)'
};

// Helper component for consistent input styling and validation
const ParamInput = ({ 
  label, 
  value, 
  onChange, 
  hint, 
  min = 0, 
  max, 
  step = 1, 
  suffix 
}: { 
  label: string; 
  value: number; 
  onChange: (val: number) => void; 
  hint?: string; 
  min?: number; 
  max?: number; 
  step?: number;
  suffix?: string;
}) => (
  <div className="mb-4">
    <div className="flex justify-between items-baseline mb-1">
      <label className="block text-xs font-bold text-gray-300">{label}</label>
      <div className="flex gap-2 text-[10px] text-gray-600">
        {min !== undefined && <span>Min: {min}</span>}
        {max !== undefined && <span>Max: {max}</span>}
      </div>
    </div>
    <div className="relative group">
      <input 
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          if (!isNaN(val)) {
             onChange(val);
          }
        }}
        onBlur={(e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val)) val = min;
            if (min !== undefined && val < min) val = min;
            if (max !== undefined && val > max) val = max;
            if (step < 1) {
                const factor = 1 / step;
                val = Math.round(val * factor) / factor;
            }
            onChange(val);
        }}
        className="w-full bg-black border border-gray-700 rounded p-2 pr-8 text-white font-mono text-sm focus:border-crypto-accent focus:outline-none transition-colors group-hover:border-gray-600"
      />
      {suffix && <span className="absolute right-3 top-2 text-xs text-gray-500 pointer-events-none">{suffix}</span>}
    </div>
    {hint && <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed border-l-2 border-gray-800 pl-2">{hint}</p>}
  </div>
);

const ConfigPanel: React.FC<Props> = ({ config, onConfigChange, onClose }) => {
  // State for strategy parameter editing selection
  const [editingStrategy, setEditingStrategy] = useState<StrategyType>(StrategyType.MA_CROSSOVER);

  const toggleAsset = (asset: CryptoCurrency) => {
    const current = config.selectedAssets;
    let next: CryptoCurrency[];
    
    if (current.includes(asset)) {
      if (current.length <= 1) return;
      next = current.filter(a => a !== asset);
    } else {
      next = [...current, asset];
    }
    
    onConfigChange({ ...config, selectedAssets: next });
  };

  const toggleStrategy = (type: StrategyType) => {
      const nextStrategies = config.activeStrategies.map(s => 
          s.type === type ? { ...s, enabled: !s.enabled } : s
      );
      onConfigChange({ ...config, activeStrategies: nextStrategies });
  };

  const updateStrategyWeight = (type: StrategyType, weight: number) => {
      const nextStrategies = config.activeStrategies.map(s => 
          s.type === type ? { ...s, weight: Math.max(0, Math.min(10, weight)) } : s
      );
      onConfigChange({ ...config, activeStrategies: nextStrategies });
  };

  const updateParam = (key: keyof typeof config.strategyParams, value: number) => {
    onConfigChange({
      ...config,
      strategyParams: {
        ...config.strategyParams,
        [key]: value
      }
    });
  };

  const renderStrategyParams = (strategyType: StrategyType) => {
    const info = strategyInfoMap[strategyType];
    
    const InfoBox = (
      <div className="bg-blue-900/20 border border-blue-800/50 rounded p-3 mb-4 text-xs">
        <h5 className="font-bold text-blue-400 mb-1 flex items-center gap-2">
          💡 策略原理
        </h5>
        <p className="text-gray-300 mb-2 leading-relaxed opacity-90">{info.desc}</p>
        <div className="bg-black/40 p-2 rounded border border-white/5 whitespace-pre-line text-gray-400">
          {info.usage}
        </div>
      </div>
    );

    switch (strategyType) {
      case StrategyType.MA_CROSSOVER:
      case StrategyType.EMA_CROSSOVER:
        return (
          <div>
            {InfoBox}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ParamInput 
                label="快线周期 (Fast Period)"
                value={config.strategyParams.fastPeriod}
                onChange={(v) => updateParam('fastPeriod', v)}
                min={2} max={100}
                hint="短期均线（如 7）。数值越小反应越快，入场更早，但在震荡市中可能产生更多假信号。"
              />
              <ParamInput 
                label="慢线周期 (Slow Period)"
                value={config.strategyParams.slowPeriod}
                onChange={(v) => updateParam('slowPeriod', v)}
                min={5} max={300}
                hint="长期均线（如 25）。用于确定主趋势方向。必须大于快线周期。"
              />
            </div>
          </div>
        );
      case StrategyType.RSI_REVERSION:
        return (
          <div>
            {InfoBox}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ParamInput 
                label="RSI 计算周期"
                value={config.strategyParams.rsiPeriod}
                onChange={(v) => updateParam('rsiPeriod', v)}
                min={2} max={50}
                hint="标准值为 14。较短周期（如 7）波动剧烈，较长周期（如 21）信号平滑。"
              />
              <ParamInput 
                label="超买阈值 (Sell)"
                value={config.strategyParams.rsiOverbought}
                onChange={(v) => updateParam('rsiOverbought', v)}
                min={50} max={99}
                hint="当 RSI 高于此值（如 70）时，视为'超买'，寻找做空机会。"
              />
              <ParamInput 
                label="超卖阈值 (Buy)"
                value={config.strategyParams.rsiOversold}
                onChange={(v) => updateParam('rsiOversold', v)}
                min={1} max={50}
                hint="当 RSI 低于此值（如 30）时，视为'超卖'，寻找做多机会。"
              />
            </div>
          </div>
        );
      case StrategyType.BOLLINGER_BREAKOUT:
        return (
          <div>
            {InfoBox}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ParamInput 
                label="均线周期 (Period)"
                value={config.strategyParams.bbPeriod}
                onChange={(v) => updateParam('bbPeriod', v)}
                min={5} max={100}
                hint="布林带中轨（SMA）的计算周期，标准为 20。"
              />
              <ParamInput 
                label="标准差倍数 (StdDev)"
                value={config.strategyParams.bbStdDev}
                onChange={(v) => updateParam('bbStdDev', v)}
                min={1} max={4} step={0.1}
                hint="决定通道宽度（标准 2.0）。数值越小易触发突破信号，数值越大信号越少。"
              />
            </div>
          </div>
        );
      case StrategyType.MACD_TREND:
        return (
           <div>
            {InfoBox}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ParamInput 
                label="Fast EMA"
                value={config.strategyParams.macdFast}
                onChange={(v) => updateParam('macdFast', v)}
                min={2} max={50}
                hint="标准 12。灵敏反映价格的短期动能变化。"
              />
              <ParamInput 
                label="Slow EMA"
                value={config.strategyParams.macdSlow}
                onChange={(v) => updateParam('macdSlow', v)}
                min={5} max={100}
                hint="标准 26。反映价格的中长期趋势。"
              />
              <ParamInput 
                label="Signal Smoothing"
                value={config.strategyParams.macdSignal}
                onChange={(v) => updateParam('macdSignal', v)}
                min={2} max={50}
                hint="标准 9。MACD 线与其信号线的交叉用于生成买卖信号。"
              />
            </div>
          </div>
        );
      case StrategyType.MARTINGALE:
        return (
           <div>
            {InfoBox}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ParamInput 
                label="补仓跌幅 (%)"
                value={config.strategyParams.martingalePriceDrop}
                onChange={(v) => updateParam('martingalePriceDrop', v)}
                min={0.1} max={20} step={0.1} suffix="%"
                hint="触发加仓的价格下跌百分比。"
              />
              <ParamInput 
                label="止盈目标 (%)"
                value={config.strategyParams.martingaleProfitTarget}
                onChange={(v) => updateParam('martingaleProfitTarget', v)}
                min={0.1} max={50} step={0.1} suffix="%"
                hint="整体持仓的获利目标，达标后一次性平仓。"
              />
              <ParamInput 
                label="加仓倍数 (Multiplier)"
                value={config.strategyParams.martingaleVolumeMultiplier}
                onChange={(v) => updateParam('martingaleVolumeMultiplier', v)}
                min={1.0} max={5.0} step={0.1} suffix="x"
                hint="每次加仓的数量倍数。建议 1.0-1.5。"
              />
            </div>
          </div>
        );
      default:
        return (
          <div>
             {InfoBox}
             <p className="text-sm text-gray-500 italic p-2 border border-dashed border-gray-800 rounded">当前策略无可配置的特定参数。</p>
          </div>
        );
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full bg-crypto-panel border border-gray-800 rounded-lg p-8 animate-fade-in shadow-xl h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4 sticky top-0 bg-crypto-panel z-10 backdrop-blur-sm bg-opacity-95">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <span className="w-1 h-6 bg-crypto-accent rounded"></span>
          全局系统配置
        </h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl transition-colors">&times;</button>
      </div>
      
      <div className="space-y-8">
        {/* Binance API Key */}
        <div className="group">
          <label className="block text-sm font-bold text-gray-300 mb-2 group-hover:text-crypto-accent transition-colors">
            Binance API Key (实盘交易)
          </label>
          <input 
            type="password" 
            value={config.binanceApiKey || ''}
            onChange={(e) => onConfigChange({...config, binanceApiKey: e.target.value})}
            className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-crypto-accent focus:ring-1 focus:ring-crypto-accent outline-none transition-all font-mono text-sm"
            placeholder="输入 Binance API Key..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div className="group">
              <label className="block text-sm font-bold text-gray-300 mb-2 group-hover:text-crypto-accent transition-colors">
                模拟账户本金 (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-gray-500">$</span>
                <input 
                  type="number" 
                  min="100"
                  max="1000000"
                  value={config.initialCapital}
                  onChange={(e) => onConfigChange({...config, initialCapital: Math.max(0, Number(e.target.value))})}
                  className="w-full bg-black border border-gray-700 rounded-lg p-3 pl-7 text-white focus:border-crypto-accent focus:ring-1 focus:ring-crypto-accent outline-none transition-all font-mono"
                />
              </div>
            </div>
            <div className="group">
              <label className="block text-sm font-bold text-gray-300 mb-2 group-hover:text-crypto-accent transition-colors">
                交易杠杆 (Leverage)
              </label>
              <div className="relative">
                 <span className="absolute right-3 top-3 text-xs text-gray-500">x</span>
                 <input 
                  type="number" 
                  min="1"
                  max="125"
                  value={config.leverage || 1}
                  onChange={(e) => onConfigChange({...config, leverage: Math.max(1, Math.min(125, Number(e.target.value)))})}
                  className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-crypto-accent focus:ring-1 focus:ring-crypto-accent outline-none transition-all font-mono"
                />
              </div>
            </div>
        </div>

        {/* Strategy Section */}
        <div className="group bg-[#161A1E] p-5 rounded-lg border border-gray-800 shadow-inner">
            <label className="block text-sm font-bold text-crypto-accent mb-4 uppercase tracking-wide flex items-center gap-2">
              <SettingsIcon className="w-4 h-4"/> 组合策略引擎
            </label>
            
            <div className="space-y-3 mb-6">
                <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 uppercase font-bold mb-2 px-2">
                    <div className="col-span-1 text-center">启用</div>
                    <div className="col-span-6">策略名称</div>
                    <div className="col-span-5 text-center">权重 (1-10)</div>
                </div>
                {config.activeStrategies.map((strategy) => (
                    <div key={strategy.type} className={`grid grid-cols-12 gap-2 items-center p-2 rounded border transition-all ${strategy.enabled ? 'bg-black border-gray-700' : 'bg-transparent border-transparent hover:bg-white/5'}`}>
                        <div className="col-span-1 flex justify-center">
                            <input 
                                type="checkbox" 
                                checked={strategy.enabled}
                                onChange={() => toggleStrategy(strategy.type)}
                                className="w-4 h-4 accent-crypto-accent rounded cursor-pointer"
                            />
                        </div>
                        <div className="col-span-6 text-sm font-medium text-gray-300">
                            {strategyLabelMap[strategy.type]}
                        </div>
                        <div className="col-span-5 flex items-center gap-2">
                            <input 
                                type="range" 
                                min="1" max="10" step="1"
                                value={strategy.weight}
                                onChange={(e) => updateStrategyWeight(strategy.type, parseInt(e.target.value))}
                                disabled={!strategy.enabled}
                                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-crypto-accent disabled:opacity-30"
                            />
                            <span className="text-xs font-mono w-6 text-right text-gray-400">{strategy.weight}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Dynamic Strategy Params */}
            <div className="border-t border-gray-800 pt-5">
               <div className="flex justify-between items-center mb-4">
                   <h4 className="text-xs text-gray-400 font-bold uppercase flex items-center gap-2">
                     <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]"></span>
                     参数微调 (Parameter Tuning)
                   </h4>
                   <select 
                    value={editingStrategy}
                    onChange={(e) => setEditingStrategy(e.target.value as StrategyType)}
                    className="bg-black border border-gray-700 text-xs rounded px-2 py-1 text-white outline-none"
                   >
                       {Object.values(StrategyType).map(t => (
                           <option key={t} value={t}>{strategyLabelMap[t]}</option>
                       ))}
                   </select>
               </div>
               <div className="bg-black/50 p-3 rounded border border-gray-800/50">
                  {renderStrategyParams(editingStrategy)}
               </div>
            </div>
        </div>

        {/* Assets Selection */}
        <div className="group">
          <label className="block text-sm font-bold text-gray-300 mb-3 group-hover:text-crypto-accent transition-colors">
            监控资产组合 (Portfolio)
          </label>
          <div className="flex flex-wrap gap-3">
            {Object.values(CryptoCurrency).map((asset) => {
              const isSelected = config.selectedAssets.includes(asset);
              return (
                <button
                  key={asset}
                  onClick={() => toggleAsset(asset)}
                  className={`px-4 py-2.5 rounded-md font-mono text-sm font-bold transition-all border relative overflow-hidden ${
                    isSelected 
                      ? 'bg-crypto-accent border-crypto-accent text-white shadow-[0_0_15px_rgba(41,98,255,0.25)]' 
                      : 'bg-black border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300'
                  }`}
                >
                  {asset}
                  {isSelected && <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[10px] border-l-transparent border-b-[10px] border-b-white opacity-50"></div>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Risk Level */}
        <div className="group">
          <label className="block text-sm font-bold text-gray-300 mb-3 group-hover:text-crypto-accent transition-colors">
            风险控制等级 (Risk Management)
          </label>
          <div className="grid grid-cols-3 gap-4">
            {[RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH].map((level) => {
              const isSelected = config.riskLevel === level;
              let activeClass = '';
              let description = '';
              
              if (level === RiskLevel.LOW) {
                  activeClass = 'border-green-500 bg-green-900/20 text-green-400 shadow-[0_0_10px_rgba(34,197,94,0.1)]';
                  description = '小仓位 (10%)，严控止损';
              }
              if (level === RiskLevel.MEDIUM) {
                  activeClass = 'border-blue-500 bg-blue-900/20 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]';
                  description = '标准仓位 (15%)，平衡收益';
              }
              if (level === RiskLevel.HIGH) {
                  activeClass = 'border-red-500 bg-red-900/20 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.1)]';
                  description = '大仓位 (30%)，追求高波幅';
              }

              return (
                <button
                  key={level}
                  onClick={() => onConfigChange({...config, riskLevel: level})}
                  className={`p-4 rounded-lg border transition-all flex flex-col items-center gap-1 ${
                    isSelected 
                      ? activeClass 
                      : 'bg-black border-gray-800 text-gray-600 hover:border-gray-600 hover:text-gray-400'
                  }`}
                >
                  <span className="font-bold text-sm">{riskLabelMap[level]}</span>
                  <span className="text-[10px] opacity-70">{description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-6 border-t border-gray-800">
          <button 
            onClick={onClose}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-lg transition-all shadow-lg transform hover:-translate-y-0.5 flex justify-center items-center gap-2"
          >
            <span>保存配置并生效</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Icon Helper
const SettingsIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
);

export default ConfigPanel;
