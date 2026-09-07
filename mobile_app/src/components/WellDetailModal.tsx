import React from 'react';
import { X, CheckCircle, AlertTriangle, XCircle, Activity, Droplets } from 'lucide-react';
import type { WellResult } from '../core/types';

interface WellDetailModalProps {
  well: WellResult | null;
  cutoff: number;
  onClose: () => void;
}

export const WellDetailModal: React.FC<WellDetailModalProps> = ({ well, cutoff, onClose }) => {
  if (!well) return null;

  const isPos = well.status === 'POSITIVE';
  const isBorder = well.status === 'BORDERLINE';

  const badgeColor = isPos
    ? 'bg-red-500/20 text-red-400 border-red-500/40'
    : isBorder
    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';

  const StatusIcon = isPos ? XCircle : isBorder ? AlertTriangle : CheckCircle;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black text-white px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700">
              {well.row}{well.col}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${badgeColor}`}>
              <StatusIcon className="w-3 h-3" />
              {well.status}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Meniscus Zoom Image & OD Highlight */}
          <div className="flex gap-3 items-center bg-slate-950/40 p-3 rounded-xl border border-slate-800">
            {well.cropDataUrl ? (
              <div className="w-20 h-20 rounded-full border-2 border-slate-600 overflow-hidden shrink-0 shadow-inner">
                <img
                  src={well.cropDataUrl}
                  alt={`Well ${well.row}${well.col}`}
                  className="w-full h-full object-cover scale-110"
                />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                <Droplets className="w-8 h-8 text-slate-500" />
              </div>
            )}

            <div className="flex-1">
              <span className="text-xs text-slate-400 block font-medium">Predicted Optical Density</span>
              <div className="text-2xl font-black text-white tracking-tight">
                {well.predictedOd.toFixed(3)} <span className="text-sm font-semibold text-slate-400">OD</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Cutoff: <span className="font-semibold text-slate-200">{cutoff.toFixed(3)} OD</span> (
                <span className={well.predictedOd > cutoff ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {well.predictedOd > cutoff ? `+${(well.predictedOd - cutoff).toFixed(3)}` : `-${(cutoff - well.predictedOd).toFixed(3)}`}
                </span>
                )
              </div>
            </div>
          </div>

          {/* Optical Physics Spectral Metrics */}
          {well.features && (
            <div>
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1 mb-2">
                <Activity className="w-3.5 h-3.5 text-sky-400" /> Optical Spectral Physics
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Total Chroma (C*ab)</span>
                  <span className="font-bold text-white">{(well.features.Chroma ?? 0).toFixed(2)}</span>
                </div>
                <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Hue Angle (θab)</span>
                  <span className="font-bold text-white">{(well.features.Hue_Angle ?? 0).toFixed(2)} rad</span>
                </div>
                <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">SSAI (Absorbance Index)</span>
                  <span className="font-bold text-white">{(well.features.SSAI ?? 0).toFixed(3)}</span>
                </div>
                <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Meniscus Depth Ratio</span>
                  <span className="font-bold text-white">{(well.features.Meniscus_Depth_Ratio ?? 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Clinical Interpretation Guidance */}
          <div className={`p-2.5 rounded-lg border text-xs leading-relaxed ${isPos ? 'bg-red-950/30 border-red-900/40 text-red-200' : 'bg-emerald-950/30 border-emerald-900/40 text-emerald-200'}`}>
            {isPos ? (
              <p>
                ⚠️ <strong>Pathogen Alert:</strong> Well absorption exceeds the negative control safety threshold. Viral antigens detected in sample.
              </p>
            ) : (
              <p>
                ✅ <strong>Negative Sample:</strong> Well optical density is within the baseline negative control range. Safe for biosecure pond stocking.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
