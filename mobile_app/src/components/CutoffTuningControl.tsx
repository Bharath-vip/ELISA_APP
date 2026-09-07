import React, { useState } from 'react';
import { Sliders, ShieldAlert, ShieldCheck, Info } from 'lucide-react';
import type { DiagnosticsSummary } from '../core/types';

interface CutoffTuningControlProps {
  summary: DiagnosticsSummary;
  onCutoffChange: (newCutoff: number) => void;
}

export const CutoffTuningControl: React.FC<CutoffTuningControlProps> = ({
  summary,
  onCutoffChange,
}) => {
  const [activePreset, setActivePreset] = useState<'standard' | 'quarantine' | 'harvest' | 'custom'>('standard');
  const [customValue, setCustomValue] = useState<number>(summary.cutoffValue);

  const mean = summary.meanNeg;
  const sd = summary.sdNeg;

  const handlePresetSelect = (preset: 'standard' | 'quarantine' | 'harvest' | 'custom') => {
    setActivePreset(preset);
    let val = summary.cutoffValue;
    if (preset === 'standard') {
      val = Math.round((mean + 3 * sd) * 10000) / 10000;
    } else if (preset === 'quarantine') {
      val = Math.round((mean + 2 * sd) * 10000) / 10000;
    } else if (preset === 'harvest') {
      val = Math.round((mean + 4 * sd) * 10000) / 10000;
    } else if (preset === 'custom') {
      val = customValue;
    }
    setCustomValue(val);
    onCutoffChange(val);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCustomValue(val);
    setActivePreset('custom');
    onCutoffChange(val);
  };

  const posPct = summary.totalWells > 0 ? Math.round((summary.positiveCount / summary.totalWells) * 100) : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-md space-y-3 font-sans">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Diagnostic Cut-off Fine-Tuning
          </h3>
        </div>

        <div
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono flex items-center gap-1 ${
            summary.outbreakAlert
              ? 'bg-red-500/20 text-red-400 border border-red-500/40'
              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
          }`}
        >
          {summary.outbreakAlert ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          <span>{summary.positiveCount} Pos ({posPct}%)</span>
        </div>
      </div>

      {/* Mode Preset Pills */}
      <div className="grid grid-cols-4 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800/80">
        <button
          onClick={() => handlePresetSelect('standard')}
          className={`py-1.5 px-1 rounded-lg text-[10px] font-bold transition-all ${
            activePreset === 'standard'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
          title="WOAH Standard: Mean + 3 SD"
        >
          WOAH (+3σ)
        </button>

        <button
          onClick={() => handlePresetSelect('quarantine')}
          className={`py-1.5 px-1 rounded-lg text-[10px] font-bold transition-all ${
            activePreset === 'quarantine'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
          title="Quarantine: Mean + 2 SD (High Sensitivity)"
        >
          Quarantine (+2σ)
        </button>

        <button
          onClick={() => handlePresetSelect('harvest')}
          className={`py-1.5 px-1 rounded-lg text-[10px] font-bold transition-all ${
            activePreset === 'harvest'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
          title="Harvest: Mean + 4 SD (High Specificity)"
        >
          Harvest (+4σ)
        </button>

        <button
          onClick={() => handlePresetSelect('custom')}
          className={`py-1.5 px-1 rounded-lg text-[10px] font-bold transition-all ${
            activePreset === 'custom'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
          title="Custom Threshold Slider"
        >
          Custom
        </button>
      </div>

      {/* Interactive Slider */}
      <div className="space-y-1 pt-0.5">
        <div className="flex justify-between text-xs font-mono">
          <span className="text-slate-400 flex items-center gap-1 text-[11px]">
            <Info className="w-3 h-3 text-slate-500" /> Active Threshold:
          </span>
          <span className="text-white font-bold text-sm bg-slate-950 px-2 py-0.5 rounded border border-slate-700">
            {customValue.toFixed(4)} OD
          </span>
        </div>

        <input
          type="range"
          min="0.05"
          max="0.60"
          step="0.005"
          value={customValue}
          onChange={handleSliderChange}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
        />

        <div className="flex justify-between text-[9px] text-slate-500 font-mono">
          <span>0.050 OD (Ultra Sensitive)</span>
          <span>Baseline: {mean.toFixed(3)} OD</span>
          <span>0.600 OD (Strict)</span>
        </div>
      </div>
    </div>
  );
};
