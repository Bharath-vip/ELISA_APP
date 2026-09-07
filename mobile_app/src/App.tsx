import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  Layers,
  FileSpreadsheet,
  Eye,
  Activity,
  FileDown,
  Download,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { processPlateImage, type FullAnalysisOutput, type AnalysisProgress } from './core/pipeline';
import type { WellResult } from './core/types';
import { CameraModal } from './components/CameraModal';
import { MicroplateGrid } from './components/MicroplateGrid';
import { WellDetailModal } from './components/WellDetailModal';
import { generateClinicalPdfReport, downloadPdf } from './core/pdfGenerator';
import { generatePlateCsv, downloadCsv, copyMatrixToClipboard } from './core/exportUtils';

const SAMPLE_PLATES = [
  { id: 'plate_0002_a', name: 'Plate 0002 (Test Plate)', path: '/sample_plates/plate_0002_a.jpg', cols: 11 },
  { id: 'plate_0006_a', name: 'Plate 0006 (Test Plate)', path: '/sample_plates/plate_0006_a.jpg', cols: 10 },
  { id: 'plate_0004_a', name: 'Plate 0004 (Control Plate)', path: '/sample_plates/plate_0004_a.jpg', cols: 12 },
];

export const App: React.FC = () => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);

  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [analysisOutput, setAnalysisOutput] = useState<FullAnalysisOutput | null>(null);
  const [selectedWell, setSelectedWell] = useState<WellResult | null>(null);
  const [selectedTab, setSelectedTab] = useState<'grid' | 'overlay' | 'matrix'>('grid');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [currentPlateTitle, setCurrentPlateTitle] = useState('Plate 0002');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSamplePlate(SAMPLE_PLATES[0]);
  }, []);

  const loadSamplePlate = async (sample: typeof SAMPLE_PLATES[0]) => {
    setCurrentPlateTitle(sample.name);
    setProgress({ stage: 'detecting', message: 'Analyzing plate image...', progressPercent: 20 });

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = sample.path;
    img.onload = async () => {
      try {
        const out = await processPlateImage(img, sample.cols, setProgress);
        setAnalysisOutput(out);
      } catch (err) {
        console.error('Inference error:', err);
      }
    };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCurrentPlateTitle(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = async () => {
        try {
          const out = await processPlateImage(img, 10, setProgress);
          setAnalysisOutput(out);
        } catch (err) {
          console.error('Inference error:', err);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = async (canvas: HTMLCanvasElement) => {
    setCurrentPlateTitle('Camera Capture');
    try {
      const out = await processPlateImage(canvas, 10, setProgress);
      setAnalysisOutput(out);
    } catch (err) {
      console.error('Inference error:', err);
    }
  };

  const handleDownloadPdf = async () => {
    if (!analysisOutput) return;
    setIsGeneratingPdf(true);
    try {
      const pdfBytes = await generateClinicalPdfReport(
        analysisOutput.results,
        analysisOutput.summary,
        currentPlateTitle
      );
      await downloadPdf(pdfBytes, `${currentPlateTitle.replace(/[^a-zA-Z0-9]/g, '_')}_Report.pdf`);
    } catch (err) {
      console.error('PDF error:', err);
      alert('Could not generate PDF report.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExportCsv = async () => {
    if (!analysisOutput) return;
    try {
      const csvStr = generatePlateCsv(
        analysisOutput.results,
        analysisOutput.summary,
        analysisOutput.numCols,
        currentPlateTitle
      );
      await downloadCsv(csvStr, `${currentPlateTitle.replace(/[^a-zA-Z0-9]/g, '_')}_Data.csv`);
    } catch (err) {
      console.error('CSV error:', err);
      alert('Could not export CSV.');
    }
  };

  const handleCopyMatrix = async () => {
    if (!analysisOutput) return;
    const success = await copyMatrixToClipboard(analysisOutput.results, analysisOutput.numCols);
    if (success) {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Toast Notification */}
      {copiedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-slate-950 px-4 py-2 rounded-full font-bold text-xs shadow-2xl flex items-center gap-1.5 animate-in fade-in">
          <Check className="w-4 h-4" />
          <span>Matrix copied to clipboard</span>
        </div>
      )}

      {/* Clean, Minimal Header */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center text-lg">
            🦐
          </div>
          <h1 className="text-base font-bold text-white tracking-tight">ELISA Reader</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold active:scale-95 transition-all"
            title="Upload Photo"
          >
            <Upload className="w-4 h-4 text-slate-400" />
            <span>Upload</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />

          <button
            onClick={() => setIsCameraOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
          >
            <Camera className="w-4 h-4" />
            <span>Camera</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-lg w-full mx-auto p-3.5 space-y-3 flex flex-col">
        {/* Sample Plate Dropdown */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-slate-400 shrink-0">Sample:</span>
          <select
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none font-semibold truncate"
            onChange={(e) => {
              const s = SAMPLE_PLATES.find((p) => p.id === e.target.value);
              if (s) loadSamplePlate(s);
            }}
          >
            {SAMPLE_PLATES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Progress Bar during processing */}
        {progress && progress.stage !== 'done' && progress.stage !== 'idle' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-md">
            <div className="flex justify-between text-xs font-medium mb-1.5">
              <span className="text-sky-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 animate-spin" /> {progress.message}
              </span>
              <span className="text-sky-400 font-mono">{progress.progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-300"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Results Section */}
        {analysisOutput && (
          <>
            {/* View Mode Tabs */}
            <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
              <button
                onClick={() => setSelectedTab('grid')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  selectedTab === 'grid'
                    ? 'bg-slate-800 text-white shadow-sm font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Plate Grid</span>
              </button>

              <button
                onClick={() => setSelectedTab('overlay')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  selectedTab === 'overlay'
                    ? 'bg-slate-800 text-white shadow-sm font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Detection</span>
              </button>

              <button
                onClick={() => setSelectedTab('matrix')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  selectedTab === 'matrix'
                    ? 'bg-slate-800 text-white shadow-sm font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Data Table</span>
              </button>
            </div>

            {/* Tab 1: Interactive Grid */}
            {selectedTab === 'grid' && (
              <div className="space-y-2.5">
                <MicroplateGrid
                  results={analysisOutput.results}
                  numCols={analysisOutput.numCols}
                  selectedWell={selectedWell}
                  onSelectWell={(w) => setSelectedWell(w)}
                />

                {/* Clean Status Legend */}
                <div className="flex justify-center gap-5 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>Negative</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span>Borderline</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span>Positive</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Detection Overlay View */}
            {selectedTab === 'overlay' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-sm overflow-hidden">
                <img
                  src={analysisOutput.annotatedImageUrl}
                  alt="Detection Overlay"
                  className="w-full rounded-xl object-contain max-h-[380px]"
                />
              </div>
            )}

            {/* Tab 3: Numerical Data Table */}
            {selectedTab === 'matrix' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-sm space-y-2">
                <div className="flex justify-between items-center px-1">
                  <span className="text-xs font-semibold text-slate-300">Optical Density (OD 450nm)</span>
                  <button
                    onClick={handleCopyMatrix}
                    className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-center text-xs font-mono">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-800">
                        <th className="p-1">Row</th>
                        {Array.from({ length: analysisOutput.numCols }, (_, i) => (
                          <th key={i} className="p-1 font-bold">
                            {i + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((rowLetter) => (
                        <tr key={rowLetter} className="border-b border-slate-800/40">
                          <td className="p-1.5 font-bold text-slate-400">{rowLetter}</td>
                          {Array.from({ length: analysisOutput.numCols }, (_, c) => {
                            const well = analysisOutput.results.find(
                              (w) => w.row === rowLetter && w.col === c + 1
                            );
                            const isPos = well && well.predictedOd > analysisOutput.summary.cutoffValue;
                            return (
                              <td
                                key={c}
                                className={`p-1.5 font-semibold ${
                                  isPos ? 'text-red-400 font-bold' : 'text-slate-300'
                                }`}
                              >
                                {well ? well.predictedOd.toFixed(2) : '-'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Clean Export Actions */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="py-2.5 px-3 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
              >
                <FileDown className="w-4 h-4 text-red-400" />
                <span>{isGeneratingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
              </button>

              <button
                onClick={handleExportCsv}
                className="py-2.5 px-3 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Export CSV</span>
              </button>
            </div>

            {/* Minimal Outbreak Status Footer at Bottom */}
            <div className="mt-auto pt-3">
              <div
                className={`rounded-xl p-3 border flex items-center justify-between ${
                  analysisOutput.summary.outbreakAlert
                    ? 'bg-red-950/30 border-red-900/60 text-red-300'
                    : 'bg-emerald-950/30 border-emerald-900/60 text-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {analysisOutput.summary.outbreakAlert ? (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <div>
                    <span className="font-bold text-xs block text-white">
                      {analysisOutput.summary.outbreakAlert
                        ? `${analysisOutput.summary.positiveCount} of ${analysisOutput.summary.totalWells} Wells Positive`
                        : 'All Wells Negative'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Cutoff: {analysisOutput.summary.cutoffValue.toFixed(3)} OD • Baseline: {analysisOutput.summary.meanNeg.toFixed(3)} OD
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    analysisOutput.summary.outbreakAlert
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {analysisOutput.summary.outbreakAlert ? 'Positive' : 'Clear'}
                </span>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Camera Viewfinder Modal */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
      />

      {/* Well Detail Inspector Modal */}
      <WellDetailModal
        well={selectedWell}
        cutoff={analysisOutput?.summary.cutoffValue ?? 0.15}
        onClose={() => setSelectedWell(null)}
      />
    </div>
  );
};
export default App;
