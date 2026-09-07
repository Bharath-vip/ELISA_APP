import React, { useState, useEffect } from 'react';
import { Minus, Plus, RotateCcw, Sliders } from 'lucide-react';

interface ManualCutoffControlProps {
  currentCutoff: number;
  autoCutoff: number;
  isManual: boolean;
  onCutoffChange: (value: number) => void;
  onReset: () => void;
}

export const ManualCutoffControl: React.FC<ManualCutoffControlProps> = ({
  currentCutoff,
  autoCutoff,
  isManual,
  onCutoffChange,
  onReset,
}) => {
  const step = 0.01;
  const [localValue, setLocalValue] = useState<string>(currentCutoff.toFixed(3));

  useEffect(() => {
    setLocalValue(currentCutoff.toFixed(3));
  }, [currentCutoff]);

  const handleDecrement = () => {
    const next = Math.max(0.01, Math.round((currentCutoff - step) * 1000) / 1000);
    setLocalValue(next.toFixed(3));
    onCutoffChange(next);
  };

  const handleIncrement = () => {
    const next = Math.min(4.0, Math.round((currentCutoff + step) * 1000) / 1000);
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
      setLocalValue(currentCutoff.toFixed(3));
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-2 shadow-sm">
      {/* Label & Status Badge */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Sliders className="w-3.5 h-3.5 text-sky-400" />
        <span className="text-xs font-semibold text-slate-300">Cutoff OD:</span>
        <span
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
            isManual
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          }`}
        >
          {isManual ? 'MANUAL' : 'AUTO'}
        </span>
      </div>

      {/* Stepper Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleDecrement}
          className="w-7 h-7 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95 flex items-center justify-center transition-all border border-slate-700/50"
          title="Decrease Cutoff (-0.01 OD)"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

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
          className="w-18 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1 text-center text-xs font-mono font-bold text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
        />

        <button
          onClick={handleIncrement}
          className="w-7 h-7 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95 flex items-center justify-center transition-all border border-slate-700/50"
          title="Increase Cutoff (+0.01 OD)"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {isManual && (
          <button
            onClick={onReset}
            className="ml-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300 hover:text-white flex items-center gap-1 transition-all border border-slate-700/50"
            title={`Reset to Auto (${autoCutoff.toFixed(3)} OD)`}
          >
            <RotateCcw className="w-3 h-3 text-sky-400" />
            <span className="hidden xs:inline">Reset</span>
          </button>
        )}
      </div>
    </div>
  );
};
