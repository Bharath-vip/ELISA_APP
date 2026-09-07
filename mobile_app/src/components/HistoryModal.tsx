import React, { useState, useEffect } from 'react';
import { X, Clock, Trash2, ChevronRight, AlertOctagon, CheckCircle2 } from 'lucide-react';
import { getAllPlateRecords, deletePlateRecord, type SavedPlateRecord } from '../core/db';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadRecord: (record: SavedPlateRecord) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, onLoadRecord }) => {
  const [records, setRecords] = useState<SavedPlateRecord[]>([]);
  const [loading, setLoading] = useState(true);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md h-[80vh] max-h-[600px] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-sky-400" />
            <h2 className="text-sm font-bold text-white">Offline Test History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
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
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
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
                          {r.summary.positiveCount} Positive / {r.summary.totalWells} Wells
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleDelete(r.id, e)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
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
      </div>
    </div>
  );
};
