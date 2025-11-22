
import React from 'react';
import { Trade } from '../types';

interface Props {
  positions: Trade[];
  currentPrices: Record<string, number>;
  onClosePosition: (id: string) => void;
}

const formatPrice = (price: number) => {
  if (price < 10) return price.toFixed(4);
  return price.toFixed(2);
};

const PositionTable: React.FC<Props> = ({ positions, currentPrices, onClosePosition }) => {
  if (positions.length === 0) {
    return (
      <div className="bg-crypto-panel border border-gray-800 rounded-lg p-4 min-h-[150px] flex flex-col justify-center items-center text-gray-500 text-sm">
         暂无持仓数据
      </div>
    );
  }

  return (
    <div className="bg-crypto-panel border border-gray-800 rounded-lg overflow-hidden flex flex-col">
      <div className="p-3 bg-[#1E2329] border-b border-gray-800 font-bold text-sm text-gray-300 flex justify-between">
        <span>当前持仓 (Positions)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#161A1E] text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-2">合约</th>
              <th className="px-4 py-2">方向</th>
              <th className="px-4 py-2">杠杆</th>
              <th className="px-4 py-2 text-right">持仓量 (币/USD)</th>
              <th className="px-4 py-2 text-right">开仓价</th>
              <th className="px-4 py-2 text-right">标记价</th>
              <th className="px-4 py-2 text-right">强平价格</th>
              <th className="px-4 py-2 text-right">未结盈亏 (PnL)</th>
              <th className="px-4 py-2 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {positions.map((pos) => {
              const isLong = pos.type === 'BUY';
              const currentPrice = currentPrices[pos.symbol] || pos.price;
              const pnl = (currentPrice - pos.price) * pos.amount * (isLong ? 1 : -1);
              const pnlClass = pnl >= 0 ? 'text-crypto-up' : 'text-crypto-down';
              const positionValue = pos.amount * currentPrice;
              const lev = pos.leverage || 1;
              
              // 简化版强平价格计算 (Cross Margin 模式下通常看维持保证金，这里仅做独立仓位估算)
              // Long: Liq = Entry * (1 - 1/Leverage + MaintenanceMarginRate) -> Simplified: Entry * (1 - 1/Lev)
              // Short: Liq = Entry * (1 + 1/Leverage - MaintenanceMarginRate) -> Simplified: Entry * (1 + 1/Lev)
              // 假设维持保证金率极低忽略不计
              const liqPrice = isLong 
                ? pos.price * (1 - 1/lev) 
                : pos.price * (1 + 1/lev);

              return (
                <tr key={pos.id} className="hover:bg-[#1E2329] transition-colors group">
                  <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                    {pos.symbol}/USDT
                  </td>
                  <td className={`px-4 py-3 font-bold ${isLong ? 'text-crypto-up' : 'text-crypto-down'}`}>
                    {isLong ? '做多' : '做空'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">Cross {lev}x</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <div className="text-white">{pos.amount.toFixed(4)}</div>
                    <div className="text-xs text-gray-500">${positionValue.toFixed(2)}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">${formatPrice(pos.price)}</td>
                  <td className="px-4 py-3 text-right font-mono text-yellow-400">${formatPrice(currentPrice)}</td>
                  <td className="px-4 py-3 text-right font-mono text-orange-500">
                    {liqPrice <= 0 ? '--' : `$${formatPrice(liqPrice)}`}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${pnlClass}`}>
                    {pnl > 0 ? '+' : ''}{pnl.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button 
                      onClick={() => onClosePosition(pos.id)}
                      className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs rounded border border-gray-700 transition-colors"
                    >
                      市价平仓
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PositionTable;
