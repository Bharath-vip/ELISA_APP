import React, { useState, useEffect } from 'react';
import { Minus, Plus, Sliders } from 'lucide-react';

interface ManualCutoffControlProps {
  cutoff: number;
  onCutoffChange: (value: number) => void;
}

export const ManualCutoffControl: React.FC<ManualCutoffControlProps> = ({
  cutoff,
  onCutoffChange,
}) => {
  const step = 0.01;
  const [localValue, setLocalValue] = useState<string>(cutoff.toFixed(3));

  useEffect(() => {
    setLocalValue(cutoff.toFixed(3));
  }, [cutoff]);

  const handleDecrement = () => {
    const next = Math.max(0.01, Math.round((cutoff - step) * 1000) / 1000);
    setLocalValue(next.toFixed(3));
    onCutoffChange(next);
  };

  const handleIncrement = () => {
    const next = Math.min(5.0, Math.round((cutoff + step) * 1000) / 1000);
    setLocalValue(next.toFixed(3));
    onCutoffChange(next);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalValue(raw);

    const val = parseFloat(raw);
    if (!isNaN(val) && val >= 0.01 && val <= 5.0) {
      onCutoffChange(Math.round(val * 1000) / 1000);
    }
  };

  const handleInputBlur = () => {
    const val = parseFloat(localValue);
    if (!isNaN(val) && val >= 0.01 && val <= 5.0) {
      const rounded = Math.round(val * 1000) / 1000;
      setLocalValue(rounded.toFixed(3));
      onCutoffChange(rounded);
    } else {
      setLocalValue(cutoff.toFixed(3));
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 shadow-sm">
      {/* Label */}
      <div className="flex items-center gap-2 shrink-0">
        <Sliders className="w-4 h-4 text-sky-400" />
        <span className="text-xs font-semibold text-slate-200">Cutoff:</span>
      </div>

      {/* Stepper Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleDecrement}
          className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-90 flex items-center justify-center transition-all border border-slate-700"
          title="Decrease Cutoff (-0.01 OD)"
        >
          <Minus className="w-4 h-4" />
        </button>

        <div className="relative flex items-center">
          <input
            type="text"
            inputMode="decimal"
            value={localValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center text-xs font-mono font-bold text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
          <span className="text-[10px] font-mono text-slate-400 ml-1.5 hidden xs:inline">OD</span>
        </div>

        <button
          onClick={handleIncrement}
          className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-90 flex items-center justify-center transition-all border border-slate-700"
          title="Increase Cutoff (+0.01 OD)"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
