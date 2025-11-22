
import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
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
    x, 
    width, 
    payload, 
    yAxis 
  } = props;

  // Defensive check: ensure we have the necessary data and axis scaler
  if (!payload || !yAxis || typeof yAxis.scale !== 'function') {
    return null;
  }

  const { open, close, high, low } = payload;
  
  // Recharts Y-axis: 0 is at the top, larger values are at the bottom.
  // We strictly use yAxis.scale() to resolve all Y coordinates.
  const yOpen = yAxis.scale(open);
  const yClose = yAxis.scale(close);
  const yHigh = yAxis.scale(high);
  const yLow = yAxis.scale(low);

  // Safety check for NaN values
  if (isNaN(yOpen) || isNaN(yClose) || isNaN(yHigh) || isNaN(yLow)) {
    return null;
  }

  const isUp = close >= open;
  const color = isUp ? '#00C087' : '#F23645';
  
  // Calculate candle body geometry
  // In SVG coordinates, lower Y value is higher on screen
  const bodyTop = Math.min(yOpen, yClose);
  const bodyBottom = Math.max(yOpen, yClose);
  let bodyHeight = bodyBottom - bodyTop;
  
  // Ensure body has at least 1px height so it is visible even if open == close
  if (bodyHeight < 1) bodyHeight = 1;

  // Calculate width: prevent it from being too thin or too wide
  // We center the candle within the allocated band slot
  const candleWidth = Math.max(2, Math.min(width * 0.6, 12)); 
  const xPos = x + (width - candleWidth) / 2;
  const wickX = x + width / 2;

  return (
    <g>
      {/* Wick (High to Low) */}
      <line 
        x1={wickX} 
        y1={yHigh} 
        x2={wickX} 
        y2={yLow} 
        stroke={color} 
        strokeWidth="1.5"
      />
      
      {/* Body (Open to Close) */}
      <rect 
        x={xPos} 
        y={bodyTop} 
        width={candleWidth} 
        height={bodyHeight} 
        fill={color}
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
    
    return (
      <div className="bg-[#1E2329] border border-[#474D57] p-3 rounded shadow-xl text-xs font-mono z-50">
        <div className="text-[#848E9C] mb-2">{data.time}</div>
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

  // Calculate Domain padding dynamically
  const minPrice = data.length > 0 ? Math.min(...data.map(d => d.low)) : 0;
  const maxPrice = data.length > 0 ? Math.max(...data.map(d => d.high)) : 0;
  
  const range = maxPrice - minPrice;
  // Padding ensures candles don't touch the top/bottom edges
  const padding = range === 0 ? maxPrice * 0.005 : range * 0.15; 
  const yDomain = [minPrice - padding, maxPrice + padding];

  // Process data to include a range array [low, high] for the Bar component.
  // This forces Recharts to render the Bar within the visible Y-axis domain,
  // avoiding the "clipping" issue that occurs when using 'close' (0 to value) on high-value assets.
  const processedData = useMemo(() => {
    return data.map(d => ({
      ...d,
      candleRange: [d.low, d.high]
    }));
  }, [data]);

  if (!data || data.length === 0) {
    return (
       <div className="h-full w-full bg-crypto-panel border border-gray-800 rounded-lg p-4 flex items-center justify-center text-gray-500">
          Loading Data...
       </div>
    );
  }

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
          <ComposedChart data={processedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A2E39" vertical={false} />
            
            <XAxis 
              dataKey="time" 
              stroke="#848E9C" 
              tick={{fontSize: 10, fill: '#848E9C'}} 
              tickLine={false}
              axisLine={false}
              minTickGap={30}
            />
            
            <YAxis 
              domain={yDomain} 
              stroke="#848E9C" 
              tick={{fontSize: 11, fill: '#848E9C'}}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => val < 10 ? val.toFixed(4) : val.toFixed(0)}
              width={60}
              orientation="right"
              allowDataOverflow={true} 
            />
            
            <Tooltip 
              content={<CustomTooltip />} 
              cursor={{ stroke: '#474D57', strokeWidth: 1, strokeDasharray: '3 3' }}
              isAnimationActive={false}
            />

            <ReferenceLine 
              y={currentPrice} 
              stroke={color} 
              strokeDasharray="3 3" 
              label={{ position: 'insideRight', value: 'Price', fill: color, fontSize: 10 }} 
            />

            {/* 
              KEY FIX: Use 'candleRange' (array [low, high]) as dataKey.
              This treats the bar as a floating bar within the visible domain.
              Recharts will render this bar fully inside the chart area.
              Our CandleStickShape then paints the specific open/close/wick details.
            */}
            <Bar 
              dataKey="candleRange" 
              minPointSize={2}
              shape={<CandleStickShape />} 
              isAnimationActive={false}
            />

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
