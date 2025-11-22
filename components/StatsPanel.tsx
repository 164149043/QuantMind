import React from 'react';
import { Trade } from '../types';

interface Props {
  balance: number;
  initialCapital: number;
  openPositions: Trade[];
}

const StatsPanel: React.FC<Props> = ({ balance, initialCapital, openPositions }) => {
  const pnl = balance - initialCapital;
  const pnlPercent = ((pnl / initialCapital) * 100);
  const isProfit = pnl >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-crypto-panel p-4 rounded-lg border border-gray-800">
        <div className="text-crypto-muted text-xs uppercase">总资产 (Balance)</div>
        <div className="text-2xl font-mono font-bold text-white">${balance.toFixed(2)}</div>
      </div>

      <div className="bg-crypto-panel p-4 rounded-lg border border-gray-800">
        <div className="text-crypto-muted text-xs uppercase">净盈亏 (Net PnL)</div>
        <div className={`text-2xl font-mono font-bold ${isProfit ? 'text-crypto-up' : 'text-crypto-down'}`}>
          {isProfit ? '+' : ''}{pnl.toFixed(2)} ({pnlPercent.toFixed(2)}%)
        </div>
      </div>

      <div className="bg-crypto-panel p-4 rounded-lg border border-gray-800">
        <div className="text-crypto-muted text-xs uppercase">当前持仓 (Positions)</div>
        <div className="text-2xl font-mono font-bold text-blue-400">{openPositions.length}</div>
      </div>
      
       <div className="bg-crypto-panel p-4 rounded-lg border border-gray-800">
        <div className="text-crypto-muted text-xs uppercase">风险敞口 (Exposure)</div>
        <div className="text-2xl font-mono font-bold text-yellow-400">
            {/* Simple metric: active positions * fixed size / total balance */}
            {openPositions.length > 0 ? ((openPositions.length * 0.1) * 100).toFixed(0) : 0}%
        </div>
      </div>
    </div>
  );
};

export default StatsPanel;