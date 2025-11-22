
import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Brush
} from 'recharts';
import { MarketCandle } from '../types';

interface Props {
  data: MarketCandle[];
  symbol: string;
}

// Custom shape to render a single candlestick
const CandleStickShape = (props: any) => {
  const {
    x, // x coordinate calculated by Recharts Bar
    y, // y coordinate (not used directly as we calculate from O/C)
    width, // width of the slot
    height, // height (not used directly)
    payload, // Data object
    yAxis // YAxis scale function injected by Recharts
  } = props;

  // Ensure we have valid data and scale functions
  if (!payload || !yAxis || !yAxis.scale) return null;

  const { open, close, high, low } = payload;
  
  // Calculate pixel positions using the YAxis scale function
  // Recharts Y-axis: 0 is top, larger value is bottom.
  // yAxis.scale(val) converts data value to Y pixel coordinate.
  const yOpen = yAxis.scale(open);
  const yClose = yAxis.scale(close);
  const yHigh = yAxis.scale(high);
  const yLow = yAxis.scale(low);

  const isUp = close >= open;
  const color = isUp ? '#00C087' : '#F23645';
  
  // Calculate candle body width and position
  // Use a percentage of the available slot width, but clamp it for aesthetics
  const candleWidth = Math.max(2, Math.min(width * 0.6, 12)); 
  const xPos = x + (width - candleWidth) / 2; // Center the body

  const bodyTop = Math.min(yOpen, yClose);
  const bodyHeight = Math.max(1, Math.abs(yOpen - yClose)); // Ensure min height of 1px

  return (
    <g stroke={color} fill={color} strokeWidth="1.5">
      {/* Wick (High to Low) - Centered in the slot */}
      <line x1={x + width / 2} y1={yHigh} x2={x + width / 2} y2={yLow} />
      
      {/* Body (Open to Close) */}
      <rect 
        x={xPos} 
        y={bodyTop} 
        width={candleWidth} 
        height={bodyHeight} 
        stroke="none"
      />
    </g>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    
    if (!data || typeof data.open === 'undefined') return null;

    const isUp = data.close >= data.open;
    const color = isUp ? '#00C087' : '#F23645';
    
    // Format time
    const dateStr = new Date(data.timestamp).toLocaleTimeString();

    return (
      <div className="bg-[#1E2329] border border-[#474D57] p-3 rounded shadow-xl text-xs font-mono z-50">
        <div className="text-[#848E9C] mb-2">{data.time || dateStr}</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <div className="text-gray-400">Open:</div><div style={{color}}>{data.open.toFixed(2)}</div>
          <div className="text-gray-400">High:</div><div style={{color}}>{data.high.toFixed(2)}</div>
          <div className="text-gray-400">Low:</div><div style={{color}}>{data.low.toFixed(2)}</div>
          <div className="text-gray-400">Close:</div><div style={{color}}>{data.close.toFixed(2)}</div>
          <div className="text-gray-400">Vol:</div><div className="text-white">{Math.round(data.volume)}</div>
        </div>
      </div>
    );
  }
  return null;
};

const ChartComponent: React.FC<Props> = ({ data, symbol }) => {
  const lastCandle = data[data.length - 1];
  const currentPrice = lastCandle ? lastCandle.close : 0;
  const isUp = lastCandle ? lastCandle.close >= lastCandle.open : false;
  const color = isUp ? '#00C087' : '#F23645';

  // Calculate Domain padding
  const minPrice = data.length > 0 ? Math.min(...data.map(d => d.low)) : 0;
  const maxPrice = data.length > 0 ? Math.max(...data.map(d => d.high)) : 0;
  const padding = (maxPrice - minPrice) * 0.1; // 10% padding to avoid candles touching edges

  return (
    <div className="h-full w-full bg-crypto-panel border border-gray-800 rounded-lg p-4 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-crypto-text font-bold text-lg flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full animate-pulse ${isUp ? 'bg-crypto-up' : 'bg-crypto-down'}`}></span>
          {symbol}/USD
        </h3>
        <div className="flex flex-col items-end">
          <div className={`text-xl font-mono font-bold ${isUp ? 'text-crypto-up' : 'text-crypto-down'}`}>
            ${currentPrice.toFixed(2)}
          </div>
          <div className="text-xs text-crypto-muted">实时模拟/实盘</div>
        </div>
      </div>
      
      <div className="flex-grow min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A2E39" vertical={false} />
            
            <XAxis 
              dataKey="time" 
              stroke="#848E9C" 
              tick={{fontSize: 10}} 
              tickLine={false}
              axisLine={false}
              minTickGap={50}
            />
            
            <YAxis 
              domain={[minPrice - padding, maxPrice + padding]} 
              stroke="#848E9C" 
              tick={{fontSize: 11}}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => val < 10 ? val.toFixed(4) : val.toFixed(0)}
              width={60}
              orientation="right"
            />
            
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#474D57', strokeWidth: 1, strokeDasharray: '3 3' }}/>

            <ReferenceLine 
              y={currentPrice} 
              stroke={color} 
              strokeDasharray="3 3" 
              label={{ position: 'insideRight', value: 'Current', fill: color, fontSize: 10 }} 
            />

            {/* 
               Use Bar with custom shape for Candlesticks.
               dataKey="close" provides a base value, but CandleStickShape uses the full payload.
               isAnimationActive={false} is critical for performance and smooth updates.
            */}
            <Bar 
              dataKey="close" 
              shape={<CandleStickShape />} 
              isAnimationActive={false}
            />

            {/* Hidden lines to help ensuring domain coverage if auto-scale logic is needed */}
            <Line dataKey="high" stroke="none" dot={false} isAnimationActive={false} />
            <Line dataKey="low" stroke="none" dot={false} isAnimationActive={false} />

            <Brush 
              dataKey="time" 
              height={30} 
              stroke="#474D57" 
              fill="#161A1E" 
              tickFormatter={() => ''}
              travellerWidth={10}
            />

          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ChartComponent;
