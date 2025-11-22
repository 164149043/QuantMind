import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';
import { TrashIcon } from './Icons';

interface Props {
  logs: LogEntry[];
  onClear: () => void;
}

const LogPanel: React.FC<Props> = ({ logs, onClear }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'ERROR': return 'text-red-500';
      case 'WARNING': return 'text-yellow-500';
      case 'TRADE': return 'text-crypto-up';
      case 'AI': return 'text-purple-400';
      default: return 'text-crypto-muted';
    }
  };

  return (
    <div className="bg-crypto-panel border border-gray-800 rounded-lg p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-crypto-text font-bold text-sm uppercase tracking-wider">系统日志 (System Logs)</h3>
        <button onClick={onClear} className="text-crypto-muted hover:text-white" title="清空日志">
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-grow overflow-y-auto font-mono text-xs space-y-1 pr-2 max-h-[250px]">
        {logs.length === 0 && <div className="text-gray-600 italic">系统已就绪，等待交易活动...</div>}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 hover:bg-[#1E2329] p-1 rounded transition-colors">
            <span className="text-gray-600 min-w-[70px]">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span className={`font-bold min-w-[60px] ${getLevelColor(log.level)}`}>
              [{log.level}]
            </span>
            <span className="text-gray-300 break-all">{log.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default LogPanel;