import React, { useState } from 'react';
import { Sun, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type { OpticalQualityMetrics } from '../core/types';

interface OpticalQualityCardProps {
  quality: OpticalQualityMetrics;
}

export const OpticalQualityCard: React.FC<OpticalQualityCardProps> = ({ quality }) => {
  const [expanded, setExpanded] = useState(false);

  const isExcellent = quality.qualityGrade === 'EXCELLENT';
  const isGood = quality.qualityGrade === 'GOOD';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-md font-sans">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              isExcellent
                ? 'bg-emerald-500/20 text-emerald-400'
                : isGood
                ? 'bg-sky-500/20 text-sky-400'
                : 'bg-amber-500/20 text-amber-400'
            }`}
          >
            <Sun className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white">Illumination & Quality Audit</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                  isExcellent
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : isGood
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {quality.qualityGrade}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {quality.uniformityScore}% Uniformity • {quality.tiltAngleDegrees}° Tilt • {quality.wellsLockedCount} Wells Locked
            </p>
          </div>
        </div>

        <button className="p-1 rounded-lg text-slate-400 hover:text-white">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px] animate-in fade-in duration-200">
          <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/60">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Flat-Field Uniformity</span>
            <div className="flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-white font-mono font-bold text-xs">{quality.uniformityScore}%</span>
            </div>
            <span className="text-[9px] text-slate-500">2D Quadratic Model</span>
          </div>

          <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/60">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Specular Glare Trim</span>
            <div className="flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-white font-mono font-bold text-xs">{quality.glareTrimPercent}%</span>
            </div>
            <span className="text-[9px] text-slate-500">10-90% Luminance Gate</span>
          </div>

          <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/60">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Perspective Camera Tilt</span>
            <div className="flex items-center gap-1 mt-0.5">
              {quality.tiltAngleDegrees <= 4 ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span className="text-white font-mono font-bold text-xs">{quality.tiltAngleDegrees}°</span>
            </div>
            <span className="text-[9px] text-slate-500">8-DOF Homography</span>
          </div>

          <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/60">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Lattice Grid Lock</span>
            <div className="flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-white font-mono font-bold text-xs">{quality.wellsLockedCount} Wells</span>
            </div>
            <span className="text-[9px] text-slate-500">Sub-pixel Core Lock</span>
          </div>
        </div>
      )}
    </div>
  );
};
