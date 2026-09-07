import React, { useState, useEffect } from 'react';
import { X, Clock, Trash2, ChevronRight, AlertOctagon, CheckCircle2, TrendingUp } from 'lucide-react';
import { getAllPlateRecords, deletePlateRecord, type SavedPlateRecord } from '../core/db';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadRecord: (record: SavedPlateRecord) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, onLoadRecord }) => {
  const [records, setRecords] = useState<SavedPlateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'records' | 'trends'>('records');

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await getAllPlateRecords();
      setRecords(data);
    } catch (err) {
      console.error('History load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this historical test record?')) {
      await deletePlateRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-sans">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md h-[82vh] max-h-[620px] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-sky-400" />
            <h2 className="text-sm font-bold text-white">Offline Test History & Trends</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-950 px-3 py-2 border-b border-slate-800/80 gap-2">
          <button
            onClick={() => setActiveTab('records')}
            className={`flex-1 py-1 px-3 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'records'
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Saved Records ({records.length})
          </button>

          <button
            onClick={() => setActiveTab('trends')}
            className={`flex-1 py-1 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
              activeTab === 'trends'
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Longitudinal Trends</span>
          </button>
        </div>

        {/* Tab 1: Records List */}
        {activeTab === 'records' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading stored records...</div>
            ) : records.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <Clock className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-300">No test records saved yet</p>
                <p className="text-xs text-slate-500">Every plate you analyze is automatically preserved here in phone storage.</p>
              </div>
            ) : (
              records.map((r) => {
                const isOutbreak = r.summary.outbreakAlert;
                const posPct = Math.round((r.summary.positiveCount / r.summary.totalWells) * 100);
                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      onLoadRecord(r);
                      onClose();
                    }}
                    className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl p-3 flex items-center justify-between cursor-pointer active:scale-98 transition-all hover:bg-slate-800/40"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isOutbreak ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {isOutbreak ? <AlertOctagon className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-white line-clamp-1">{r.title}</h4>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                          <span>{new Date(r.timestamp).toLocaleDateString()}</span>
                          <span>•</span>
                          <span className={isOutbreak ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                            {r.summary.positiveCount} Pos ({posPct}%)
                          </span>
                        </div>
                        {r.metadata && (
                          <div className="text-[9px] text-slate-500 font-sans mt-0.5">
                            {r.metadata.pondId} • {r.metadata.species}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleDelete(r.id, e)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                        title="Delete Record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Longitudinal Trends */}
        {activeTab === 'trends' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              <span className="text-xs font-bold text-white block mb-1">Pond Infection Trajectory</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Tracks pathogen spread across sequential sampling days. Early detection allows immediate pond quarantine before biosecurity loss.
              </p>
            </div>

            {records.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No test data available for trend graphing.</div>
            ) : (
              <div className="space-y-3">
                {records.slice(0, 7).map((r) => {
                  const posPct = Math.round((r.summary.positiveCount / r.summary.totalWells) * 100);
                  const isOutbreak = r.summary.outbreakAlert;
                  return (
                    <div key={r.id} className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                      <div className="flex justify-between items-center text-xs font-semibold mb-1">
                        <span className="text-white truncate max-w-[180px]">{r.title}</span>
                        <span className={`font-mono font-bold ${isOutbreak ? 'text-red-400' : 'text-emerald-400'}`}>
                          {posPct}% ({r.summary.positiveCount}/{r.summary.totalWells})
                        </span>
                      </div>

                      <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden mb-1">
                        <div
                          className={`h-full rounded-full ${isOutbreak ? 'bg-red-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.max(posPct, 4)}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                        <span>{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>Cutoff: {r.summary.cutoffValue.toFixed(3)} OD</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
