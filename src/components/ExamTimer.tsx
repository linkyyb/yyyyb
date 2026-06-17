import { useState, useEffect, useRef } from 'react';
import { Timer, Play, Pause, RotateCcw, Settings } from 'lucide-react';

interface TimerProps { onTick?: (elapsed: number) => void; }

export default function ExamTimer({ onTick }: TimerProps) {
  const [mode, setMode] = useState<'off'|'countup'|'countdown'>('off');
  const [showSettings, setShowSettings] = useState(false);
  const [countdownMin, setCountdownMin] = useState(30);
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<any>(null);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const startStopwatch = () => {
    const start = Date.now() - elapsed * 1000;
    setRunning(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const e = Math.floor((Date.now() - start) / 1000);
      setElapsed(e); onTick?.(e);
    }, 200);
  };

  const startCountdown = () => {
    const initial = remaining > 0 ? remaining : countdownMin * 60;
    const start = Date.now();
    setRunning(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const passed = Math.floor((Date.now() - start) / 1000);
      const r = Math.max(0, initial - passed);
      setRemaining(r); onTick?.(r);
      if (r <= 0) { if (intervalRef.current) clearInterval(intervalRef.current); setRunning(false); }
    }, 200);
  };

  const pause = () => { if (intervalRef.current) clearInterval(intervalRef.current); setRunning(false); };
  const reset = () => { if (intervalRef.current) clearInterval(intervalRef.current); setRunning(false); setElapsed(0); setRemaining(0); };

  const fmt = (s: number) => { const m = Math.floor(s / 60), sec = s % 60; return m + ':' + String(sec).padStart(2, '0'); };

  return (
    <div className="flex items-center gap-1.5">
      {mode === 'off' ? (
        <button onClick={() => setMode('countup')} className="text-[10px] px-1.5 py-1 text-slate-400 dark:text-[var(--th-text-soft)] hover:text-[var(--th-text-soft)] rounded" title="计时器"><Timer className="w-3.5 h-3.5" /></button>
      ) : (
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-mono font-bold text-[var(--th-text-soft)] tabular-nums">
            {mode === 'countdown' ? (remaining <= 0 && !running ? '⏰' : '⏳') : '⏱'} {mode === 'countdown' ? fmt(remaining) : fmt(elapsed)}
          </span>
          {running ? <button onClick={pause} className="p-0.5 text-amber-500"><Pause className="w-3 h-3" /></button>
            : <button onClick={mode === 'countdown' ? startCountdown : startStopwatch} className="p-0.5 text-green-500"><Play className="w-3 h-3" /></button>}
          <button onClick={reset} className="p-0.5 text-slate-400 hover:text-red-400"><RotateCcw className="w-3 h-3" /></button>
          <button onClick={() => setShowSettings(!showSettings)} className="p-0.5 text-slate-400"><Settings className="w-3 h-3" /></button>
          {showSettings && (
            <div className="absolute top-full right-0 mt-1 p-2 bg-[var(--th-bg-card)] border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 flex flex-col gap-2">
              <button onClick={() => { reset(); setMode('countup'); }} className={"text-xs px-2 py-1 rounded " + (mode === 'countup' ? 'bg-[var(--th-bg-soft)] text-[var(--th-accent)]' : 'text-[var(--th-text-soft)] dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700')}>正计时</button>
              <button onClick={() => { reset(); setMode('countdown'); }} className={"text-xs px-2 py-1 rounded " + (mode === 'countdown' ? 'bg-[var(--th-bg-soft)] text-[var(--th-accent)]' : 'text-[var(--th-text-soft)] dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700')}>倒计时</button>
              <button onClick={() => { reset(); setMode('off'); }} className="text-xs px-2 py-1 text-red-400 hover:bg-red-50 rounded">关闭</button>
              {mode === 'countdown' && (
                <div className="flex items-center gap-1 text-xs">
                  <input type="number" min="1" max="180" value={countdownMin} onChange={e => setCountdownMin(parseInt(e.target.value) || 30)} className="w-12 px-1 py-0.5 border border-[var(--th-border)] dark:bg-slate-700 rounded text-center dark:text-white" /> 分钟
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
