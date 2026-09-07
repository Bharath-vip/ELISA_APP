import React, { useState } from 'react';
import { X, Building2, User, Thermometer, Droplets, FileText, CheckCircle } from 'lucide-react';
import type { FarmMetadata } from '../core/types';

interface MetadataModalProps {
  isOpen: boolean;
  initialMetadata?: FarmMetadata;
  onClose: () => void;
  onSave: (metadata: FarmMetadata) => void;
}

export const MetadataModal: React.FC<MetadataModalProps> = ({
  isOpen,
  initialMetadata,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<FarmMetadata>(
    initialMetadata || {
      farmName: 'Pacific Marine Hatchery',
      pondId: 'Pond 03 - Nursery',
      species: 'Penaeus vannamei (Pacific White)',
      technicianName: 'Field Biologist / QA',
      tempCelsius: '28.5',
      salinityPpt: '32.0',
      notes: 'Routine pre-transfer health surveillance sample.',
    }
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-sans">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-sky-400" />
            <h2 className="text-sm font-bold text-white">Farm & Specimen Metadata</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3 overflow-y-auto max-h-[75vh]">
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Aquaculture Facility / Farm Name
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={formData.farmName}
                onChange={(e) => setFormData({ ...formData, farmName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold"
                placeholder="e.g. Apex Coastal Hatchery"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Pond / Tank ID
              </label>
              <input
                type="text"
                value={formData.pondId}
                onChange={(e) => setFormData({ ...formData, pondId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold"
                placeholder="e.g. Pond 4B"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Shrimp Species
              </label>
              <select
                value={formData.species}
                onChange={(e) => setFormData({ ...formData, species: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold"
              >
                <option value="Penaeus vannamei (Pacific White)">P. vannamei (White)</option>
                <option value="Penaeus monodon (Black Tiger)">P. monodon (Tiger)</option>
                <option value="Macrobrachium rosenbergii">M. rosenbergii (Prawn)</option>
                <option value="Other Aquaculture Specimen">Other Specimen</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Field Technician / Biologist
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={formData.technicianName}
                onChange={(e) => setFormData({ ...formData, technicianName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold"
                placeholder="e.g. Dr. Bharath / Quality Officer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Water Temp (°C)
              </label>
              <div className="relative">
                <Thermometer className="w-4 h-4 text-amber-500 absolute left-3 top-2.5" />
                <input
                  type="number"
                  step="0.1"
                  value={formData.tempCelsius || ''}
                  onChange={(e) => setFormData({ ...formData, tempCelsius: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold"
                  placeholder="28.5"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Salinity (ppt)
              </label>
              <div className="relative">
                <Droplets className="w-4 h-4 text-sky-400 absolute left-3 top-2.5" />
                <input
                  type="number"
                  step="0.1"
                  value={formData.salinityPpt || ''}
                  onChange={(e) => setFormData({ ...formData, salinityPpt: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold"
                  placeholder="32.0"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Clinical Notes & Observations
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <textarea
                rows={2}
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-semibold"
                placeholder="Notes on shrimp feeding, moribund signs, etc."
              />
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white shadow-lg shadow-sky-600/30 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Save & Embed</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
