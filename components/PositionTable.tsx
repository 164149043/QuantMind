
import React from 'react';
import { Trade } from '../types';

interface Props {
  positions: Trade[];
  currentPrices: Record<string, number>;
  onClosePosition: (id: string) => void;
}

const formatDecimal = (num: number, decimals: number = 2) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

const formatPrice = (price: number) => {
  if (price < 1) return formatDecimal(price, 5);
  if (price < 10) return formatDecimal(price, 4);
  return formatDecimal(price, 2);
};

const PositionTable: React.FC<Props> = ({ positions, currentPrices, onClosePosition }) => {
  if (positions.length === 0) {
    return (
      <div className="bg-crypto-panel border border-gray-800 rounded-lg p-4 min-h-[150px] flex flex-col justify-center items-center text-gray-500 text-sm">
         暂无持仓数据 (No Active Positions)
      </div>
    );
  }

  return (
    <div className="bg-crypto-panel border border-gray-800 rounded-lg overflow-hidden flex flex-col shadow-lg">
      <div className="p-3 bg-[#1E2329] border-b border-gray-800 font-bold text-sm text-gray-300 flex justify-between items-center">
        <span>当前持仓 (Positions)</span>
        <span className="text-xs text-gray-500 font-normal">维持保证金率假设: 0.5%</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#161A1E] text-gray-500 text-xs uppercase font-semibold">
            <tr>
              <th className="px-4 py-3">合约 / 方向</th>
              <th className="px-4 py-3 text-right">数量 / 价值</th>
              <th className="px-4 py-3 text-right">开仓价</th>
              <th className="px-4 py-3 text-right">标记价</th>
              <th className="px-4 py-3 text-right">强平价格</th>
              <th className="px-4 py-3 text-right">保证金 (Margin)</th>
              <th className="px-4 py-3 text-right">未结盈亏 (ROE)</th>
              <th className="px-4 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 text-gray-300">
            {positions.map((pos) => {
              const isLong = pos.type === 'BUY';
              const currentPrice = currentPrices[pos.symbol] || pos.price;
              const leverage = pos.leverage || 1;
              
              // 1. PnL Calculation
              const pnl = (currentPrice - pos.price) * pos.amount * (isLong ? 1 : -1);
              
              // 2. Initial Margin Calculation (Collateral)
              // Initial Margin = (Entry Price * Amount) / Leverage
              const initialMargin = (pos.price * pos.amount) / leverage;
              
              // 3. ROE Calculation
              const roe = initialMargin > 0 ? (pnl / initialMargin) * 100 : 0;
              
              // 4. Position Notional Value
              const positionValue = pos.amount * currentPrice;

              // 5. Liquidation Price Calculation (Isolated Margin Model)
              // We assume a generic Maintenance Margin (MM) rate of 0.5% (0.005) for estimation.
              // Long Liq: Entry * (1 - 1/Lev + MM)
              // Short Liq: Entry * (1 + 1/Lev - MM)
              const mmRate = 0.005; 
              
              let liqPrice = 0;
              if (isLong) {
                liqPrice = pos.price * (1 - (1 / leverage) + mmRate);
              } else {
                liqPrice = pos.price * (1 + (1 / leverage) - mmRate);
              }

              // Visual Colors
              const pnlClass = pnl >= 0 ? 'text-crypto-up' : 'text-crypto-down';
              const directionClass = isLong ? 'text-crypto-up bg-green-900/20' : 'text-crypto-down bg-red-900/20';

              return (
                <tr key={pos.id} className="hover:bg-[#2A2E39] transition-colors group">
                  
                  {/* Symbol & Direction */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{pos.symbol}</span>
                      <span className="text-gray-500 text-xs">USDT</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${directionClass}`}>
                        {isLong ? 'Buy' : 'Sell'}
                      </span>
                      <span className="text-xs text-gray-400 font-mono bg-gray-800 px-1 rounded">
                        {leverage}x
                      </span>
                    </div>
                  </td>

                  {/* Size & Value */}
                  <td className="px-4 py-3 text-right font-mono">
                    <div className="text-white font-medium">{formatDecimal(pos.amount, 4)}</div>
                    <div className="text-xs text-gray-500">${formatDecimal(positionValue, 2)}</div>
                  </td>

                  {/* Entry Price */}
                  <td className="px-4 py-3 text-right font-mono text-gray-300">
                    ${formatPrice(pos.price)}
                  </td>

                  {/* Mark Price */}
                  <td className="px-4 py-3 text-right font-mono text-white group-hover:text-yellow-400 transition-colors">
                    ${formatPrice(currentPrice)}
                  </td>

                  {/* Liquidation Price */}
                  <td className="px-4 py-3 text-right font-mono text-orange-500">
                     {liqPrice <= 0 ? 'N/A' : `$${formatPrice(liqPrice)}`}
                  </td>

                  {/* Margin */}
                  <td className="px-4 py-3 text-right font-mono text-gray-300">
                    ${formatDecimal(initialMargin, 2)}
                  </td>

                  {/* PnL & ROE */}
                  <td className="px-4 py-3 text-right font-mono">
                    <div className={`font-bold ${pnlClass}`}>
                       {pnl > 0 ? '+' : ''}{formatDecimal(pnl, 2)}
                    </div>
                    <div className={`text-xs ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                       {roe > 0 ? '+' : ''}{formatDecimal(roe, 2)}%
                    </div>
                  </td>

                  {/* Action */}
                  <td className="px-4 py-3 text-center">
                    <button 
                      onClick={() => onClosePosition(pos.id)}
                      className="px-3 py-1.5 bg-[#2A2E39] hover:bg-gray-700 text-white text-xs rounded border border-gray-600 hover:border-gray-500 transition-all shadow-sm"
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
