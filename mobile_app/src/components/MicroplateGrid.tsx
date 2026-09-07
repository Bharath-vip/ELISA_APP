import React from 'react';
import { ROWS, type WellResult } from '../core/types';

interface MicroplateGridProps {
  results: WellResult[];
  numCols: number;
  selectedWell: WellResult | null;
  onSelectWell: (well: WellResult) => void;
}

export const MicroplateGrid: React.FC<MicroplateGridProps> = ({
  results,
  numCols,
  selectedWell,
  onSelectWell,
}) => {
  const resultMap = new Map<string, WellResult>();
  for (const r of results) {
    resultMap.set(`${r.row}_${r.col}`, r);
  }

  // Generate color based on OD and status
  const getWellStyle = (well?: WellResult) => {
    if (!well) {
      return {
        bg: 'bg-slate-900/50 border-slate-800 text-slate-600',
        ring: '',
      };
    }

    const od = well.predictedOd;
    if (well.status === 'POSITIVE') {
      if (od >= 1.2) {
        return {
          bg: 'bg-red-600 border-red-400 text-white shadow-[0_0_8px_rgba(239,68,68,0.4)]',
          ring: 'ring-red-400',
        };
      }
      return {
        bg: 'bg-rose-500 border-rose-300 text-white shadow-sm',
        ring: 'ring-rose-400',
      };
    }

    if (well.status === 'BORDERLINE') {
      return {
        bg: 'bg-amber-500 border-amber-300 text-slate-950 font-bold',
        ring: 'ring-amber-400',
      };
    }

    // Negative wells: clean dark slate with subtle contrast
    return {
      bg: 'bg-slate-900 border-slate-700/70 text-slate-300 hover:border-slate-500',
      ring: 'ring-sky-400',
    };
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-xl overflow-x-auto">
      {/* Microplate Tray Outer Frame */}
      <div className="min-w-[480px]">
        {/* Column Numbers Header */}
        <div className="flex pl-6 mb-1 text-[11px] font-mono text-slate-400">
          {Array.from({ length: numCols }, (_, i) => i + 1).map((col) => (
            <div key={col} className="flex-1 text-center font-bold">
              {col}
            </div>
          ))}
        </div>

        {/* Rows A through H */}
        <div className="space-y-1.5">
          {ROWS.map((rowLetter) => (
            <div key={rowLetter} className="flex items-center gap-1.5">
              {/* Row Letter Header */}
              <div className="w-5 text-center font-bold text-xs font-mono text-slate-400 shrink-0">
                {rowLetter}
              </div>

              {/* Wells in this Row */}
              <div className="flex-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${numCols}, minmax(0, 1fr))` }}>
                {Array.from({ length: numCols }, (_, i) => i + 1).map((colNum) => {
                  const key = `${rowLetter}_${colNum}`;
                  const well = resultMap.get(key);
                  const { bg, ring } = getWellStyle(well);
                  const isSelected = selectedWell?.row === rowLetter && selectedWell?.col === colNum;

                  return (
                    <button
                      key={key}
                      onClick={() => well && onSelectWell(well)}
                      disabled={!well}
                      className={`relative aspect-square rounded-full border flex flex-col items-center justify-center p-0.5 transition-all active:scale-90 ${bg} ${
                        isSelected ? `ring-2 ${ring} scale-105 z-10 shadow-lg` : 'hover:scale-95'
                      }`}
                    >
                      {well ? (
                        <>
                          <span className="text-[9px] font-mono font-bold leading-none">
                            {well.predictedOd.toFixed(2)}
                          </span>
                        </>
                      ) : (
                        <span className="text-[8px] text-slate-600">-</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
