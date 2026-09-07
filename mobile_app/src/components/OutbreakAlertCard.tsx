import React from 'react';
import { AlertOctagon, CheckCircle2, FileText } from 'lucide-react';
import type { DiagnosticsSummary } from '../core/types';

interface OutbreakAlertCardProps {
  summary: DiagnosticsSummary;
  onDownloadPdf: () => void;
  isGeneratingPdf: boolean;
}

export const OutbreakAlertCard: React.FC<OutbreakAlertCardProps> = ({
  summary,
  onDownloadPdf,
  isGeneratingPdf,
}) => {
  const isOutbreak = summary.outbreakAlert;

  return (
    <div
      className={`rounded-2xl border p-4 shadow-lg transition-all ${
        isOutbreak
          ? 'bg-red-950/40 border-red-800/60 shadow-red-950/20'
          : 'bg-emerald-950/40 border-emerald-800/60 shadow-emerald-950/20'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2.5 rounded-xl shrink-0 ${
            isOutbreak ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
          }`}
        >
          {isOutbreak ? <AlertOctagon className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-bold tracking-wider uppercase px-2 py-0.5 rounded-full ${
                isOutbreak ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {isOutbreak ? 'CRITICAL OUTBREAK DETECTED' : 'BIOSECURE POND STATUS'}
            </span>
          </div>

          <h3 className="text-base font-bold text-white mt-1">
            {isOutbreak
              ? 'White Spot Syndrome Virus (WSSV) Confirmed'
              : 'Negative for Viral Pathogens'}
          </h3>

          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {isOutbreak
              ? `${summary.positiveCount} of ${summary.totalWells} wells exceeded the calculated WOAH biosecurity cutoff of ${summary.cutoffValue.toFixed(3)} OD. Immediate pond quarantine recommended.`
              : `All ${summary.totalWells} wells are below the calculated WOAH safety threshold of ${summary.cutoffValue.toFixed(3)} OD. Pond is cleared for stocking and transfer.`}
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800 text-center">
        <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800/60">
          <span className="text-[10px] text-slate-400 block">Cut-Off Threshold</span>
          <span className="text-sm font-bold text-white">{summary.cutoffValue.toFixed(3)} OD</span>
        </div>
        <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800/60">
          <span className="text-[10px] text-slate-400 block">Infected Wells</span>
          <span className={`text-sm font-bold ${summary.positiveCount > 0 ? 'text-red-400' : 'text-slate-300'}`}>
            {summary.positiveCount}
          </span>
        </div>
        <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800/60">
          <span className="text-[10px] text-slate-400 block">Healthy Wells</span>
          <span className="text-sm font-bold text-emerald-400">{summary.negativeCount}</span>
        </div>
      </div>

      {/* Action Bar */}
      <div className="mt-3 pt-3 flex gap-2">
        <button
          onClick={onDownloadPdf}
          disabled={isGeneratingPdf}
          className="flex-1 py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-98 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-sky-600/20 transition-all disabled:opacity-50"
        >
          <FileText className="w-4 h-4" />
          {isGeneratingPdf ? 'Generating PDF...' : 'Download Official PDF Report'}
        </button>
      </div>
    </div>
  );
};
