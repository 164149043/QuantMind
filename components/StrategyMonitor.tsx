
import React from 'react';
import { CompositeAnalysisResult, StrategyInsight, MarketRegime, CryptoCurrency, StrategyType } from '../types';

interface Props {
  symbol: string;
  price: number;
  analysis: CompositeAnalysisResult;
}

const RegimeBadge = ({ regime }: { regime: MarketRegime }) => {
  let color = "bg-gray-700 text-gray-300";
  let icon = "➖";
  
  if (regime.type === 'TRENDING_UP') { color = "bg-crypto-up/20 text-crypto-up border-crypto-up"; icon = "🚀"; }
  if (regime.type === 'TRENDING_DOWN') { color = "bg-crypto-down/20 text-crypto-down border-crypto-down"; icon = "📉"; }
  if (regime.type === 'VOLATILE') { color = "bg-yellow-900/40 text-yellow-400 border-yellow-500"; icon = "⚡"; }
  if (regime.type === 'RANGING') { color = "bg-blue-900/20 text-blue-300 border-blue-500"; icon = "🌊"; }

  return (
    <div className={`flex flex-col gap-2 p-4 rounded-lg border ${color} transition-all duration-500`}>
       <div className="flex justify-between items-center">
         <span className="text-xs font-bold uppercase tracking-widest opacity-80">当前市场状态 (Market Regime)</span>
         <span className="text-2xl">{icon}</span>
       </div>
       <div className="text-lg font-bold">{regime.description}</div>
       <div className="grid grid-cols-2 gap-4 mt-2">
          <div>
            <div className="text-[10px] uppercase opacity-60">趋势强度</div>
            <div className="h-1.5 w-full bg-black/50 rounded-full mt-1 overflow-hidden">
               <div className="h-full bg-current transition-all duration-700" style={{width: `${regime.trendStrength}%`}}></div>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase opacity-60">波动率</div>
            <div className="h-1.5 w-full bg-black/50 rounded-full mt-1 overflow-hidden">
               <div className="h-full bg-current transition-all duration-700" style={{width: `${regime.volatility}%`}}></div>
            </div>
          </div>
       </div>
    </div>
  );
};

const StrategyCard = ({ insight }: { insight: StrategyInsight }) => {
  const signalColor = insight.signal === 'BUY' ? 'text-crypto-up' : (insight.signal === 'SELL' ? 'text-crypto-down' : 'text-gray-500');
  const weightDiff = insight.adjustedWeight - insight.baseWeight;
  const isBoosted = weightDiff > 0;
  const isSuppressed = weightDiff < 0;

  return (
    <div className="bg-[#161A1E] border border-gray-800 p-3 rounded hover:border-gray-600 transition-colors flex flex-col gap-3">
       <div className="flex justify-between items-start">
         <div className="font-bold text-sm text-gray-300">{insight.type.split('_')[0]}</div>
         <div className={`text-xs font-bold px-2 py-0.5 rounded bg-black/50 ${signalColor}`}>
            {insight.signal}
         </div>
       </div>

       {/* Metrics */}
       <div className="grid grid-cols-2 gap-y-1 gap-x-2 text-xs font-mono text-gray-500">
          {insight.metrics.map((m, idx) => (
             <div key={idx} className="flex justify-between border-b border-gray-800/50 pb-0.5">
               <span>{m.label}</span>
               <span className="text-gray-300">{m.value}</span>
             </div>
          ))}
       </div>

       {/* Auto-Tuning Visualization */}
       <div className="mt-auto pt-2 border-t border-gray-800/50">
          <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1">
             <span>策略权重 (Auto-Tune)</span>
             <div className="flex items-center gap-1">
                <span className="line-through opacity-50">{insight.baseWeight}</span>
                <span className="text-gray-600">➔</span>
                <span className={`font-bold ${isBoosted ? 'text-crypto-up' : (isSuppressed ? 'text-crypto-down' : 'text-white')}`}>
                   {insight.adjustedWeight}
                </span>
             </div>
          </div>
          <div className="text-[10px] italic opacity-70 truncate text-crypto-accent" title={insight.tuningAction}>
             {insight.tuningAction}
          </div>
       </div>
    </div>
  );
};

export const StrategyMonitor: React.FC<Props> = ({ symbol, price, analysis }) => {
  // Calculate Sentiment Score for gauge (-1 to 1)
  const sentimentPct = ((analysis.score + 1) / 2) * 100;
  
  return (
    <div className="h-full w-full bg-crypto-panel border border-gray-800 rounded-lg p-6 flex flex-col gap-6 overflow-y-auto">
      
      {/* Header: Price & Regime */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="flex flex-col justify-center">
            <h3 className="text-gray-500 font-bold text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-crypto-accent animate-pulse"></span>
              {symbol} 实时监控
            </h3>
            <div className="text-4xl font-mono font-bold text-white mt-1">
               ${price.toFixed(2)}
            </div>
         </div>
         <div className="md:col-span-2">
            <RegimeBadge regime={analysis.regime} />
         </div>
      </div>

      {/* Consensus Meter */}
      <div className="bg-[#121418] p-4 rounded-lg border border-gray-800">
         <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase">QuantMind 综合决策引擎</span>
            <span className={`text-xl font-bold ${analysis.signal === 'BUY' ? 'text-crypto-up' : (analysis.signal === 'SELL' ? 'text-crypto-down' : 'text-gray-400')}`}>
               {analysis.signal} <span className="text-sm text-gray-600 font-mono">({analysis.score.toFixed(2)})</span>
            </span>
         </div>
         <div className="relative h-4 bg-gray-800 rounded-full overflow-hidden">
            {/* Center Marker */}
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white z-10 opacity-50"></div>
            {/* Fill */}
            <div 
              className={`absolute top-0 bottom-0 transition-all duration-700 ${analysis.score > 0 ? 'bg-crypto-up left-1/2' : 'bg-crypto-down right-1/2'}`}
              style={{ width: `${Math.abs(analysis.score) * 50}%` }} // score is -1 to 1, so half width max
            ></div>
         </div>
         <div className="flex justify-between text-[10px] text-gray-500 mt-1 font-mono">
            <span>STRONG SELL</span>
            <span>NEUTRAL</span>
            <span>STRONG BUY</span>
         </div>
      </div>

      {/* Strategy Grid */}
      <div className="flex-grow">
        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
           <span>策略矩阵与自动调优 (Active Strategies & Tuning)</span>
           <span className="h-px flex-grow bg-gray-800"></span>
        </h4>
        
        {analysis.insights.length === 0 ? (
           <div className="text-center py-10 text-gray-600 italic">No strategies active. Configure in settings.</div>
        ) : (
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {analysis.insights.map(insight => (
                 <StrategyCard key={insight.type} insight={insight} />
              ))}
           </div>
        )}
      </div>

    </div>
  );
};
