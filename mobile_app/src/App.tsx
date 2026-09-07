import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  Layers,
  FileSpreadsheet,
  Eye,
  Activity,
  WifiOff,
  Sparkles,
  Clock,
  Building2,
  FileDown,
  Copy,
  Check,
} from 'lucide-react';
import { processPlateImage, type FullAnalysisOutput, type AnalysisProgress } from './core/pipeline';
import type { WellResult, FarmMetadata } from './core/types';
import { CameraModal } from './components/CameraModal';
import { MicroplateGrid } from './components/MicroplateGrid';
import { WellDetailModal } from './components/WellDetailModal';
import { OutbreakAlertCard } from './components/OutbreakAlertCard';
import { HistoryModal } from './components/HistoryModal';
import { CutoffTuningControl } from './components/CutoffTuningControl';
import { MetadataModal } from './components/MetadataModal';
import { OpticalQualityCard } from './components/OpticalQualityCard';
import { generateClinicalPdfReport, downloadPdf } from './core/pdfGenerator';
import { generatePlateCsv, downloadCsv, copyMatrixToClipboard } from './core/exportUtils';
import { savePlateRecord } from './core/db';

const SAMPLE_PLATES = [
  { id: 'plate_0002_a', name: 'Plate 0002 (Shot A) [HELD-OUT UNSEEN TEST]', path: '/sample_plates/plate_0002_a.jpg', cols: 11 },
  { id: 'plate_0006_a', name: 'Plate 0006 (Shot A) [HELD-OUT UNSEEN TEST]', path: '/sample_plates/plate_0006_a.jpg', cols: 10 },
  { id: 'plate_0004_a', name: 'Plate 0004 (Shot A) [Training Benchmark]', path: '/sample_plates/plate_0004_a.jpg', cols: 12 },
];

export const App: React.FC = () => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);

  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [analysisOutput, setAnalysisOutput] = useState<FullAnalysisOutput | null>(null);
  const [selectedWell, setSelectedWell] = useState<WellResult | null>(null);
  const [selectedTab, setSelectedTab] = useState<'grid' | 'overlay' | 'matrix'>('grid');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [currentPlateTitle, setCurrentPlateTitle] = useState('Plate 0002 (Unseen Test)');

  const [farmMetadata, setFarmMetadata] = useState<FarmMetadata>({
    farmName: 'Pacific Marine Hatchery',
    pondId: 'Pond 03 - Nursery',
    species: 'Penaeus vannamei (Pacific White)',
    technicianName: 'Field Biologist / QA',
    tempCelsius: '28.5',
    salinityPpt: '32.0',
    notes: 'Routine pre-transfer health surveillance sample.',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Automatically load the first sample plate (Plate 0002 Unseen Test) on startup
  useEffect(() => {
    loadSamplePlate(SAMPLE_PLATES[0]);
  }, []);

  const loadSamplePlate = async (sample: typeof SAMPLE_PLATES[0]) => {
    setCurrentPlateTitle(sample.name);
    setProgress({ stage: 'detecting', message: 'Loading plate image...', progressPercent: 10 });

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = sample.path;
    img.onload = async () => {
      try {
        const out = await processPlateImage(img, sample.cols, setProgress, farmMetadata);
        setAnalysisOutput(out);
        savePlateRecord({
          id: Date.now().toString(),
          title: sample.name,
          timestamp: new Date().toISOString(),
          summary: out.summary,
          results: out.results,
          numCols: out.numCols,
          thumbnailUrl: out.annotatedImageUrl,
          metadata: farmMetadata,
          quality: out.quality,
        });
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
          const out = await processPlateImage(img, 10, setProgress, farmMetadata);
          setAnalysisOutput(out);
          savePlateRecord({
            id: Date.now().toString(),
            title: file.name,
            timestamp: new Date().toISOString(),
            summary: out.summary,
            results: out.results,
            numCols: out.numCols,
            thumbnailUrl: out.annotatedImageUrl,
            metadata: farmMetadata,
            quality: out.quality,
          });
        } catch (err) {
          console.error('Inference error:', err);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = async (canvas: HTMLCanvasElement) => {
    setCurrentPlateTitle('Live Landscape Field Photo');
    try {
      const out = await processPlateImage(canvas, 10, setProgress, farmMetadata);
      setAnalysisOutput(out);
      savePlateRecord({
        id: Date.now().toString(),
        title: 'Live Landscape Field Photo',
        timestamp: new Date().toISOString(),
        summary: out.summary,
        results: out.results,
        numCols: out.numCols,
        thumbnailUrl: out.annotatedImageUrl,
        metadata: farmMetadata,
        quality: out.quality,
      });
    } catch (err) {
      console.error('Inference error:', err);
    }
  };

  const handleCutoffChange = (newCutoff: number) => {
    if (!analysisOutput) return;
    const updatedResults = analysisOutput.results.map((w) => ({
      ...w,
      status: (w.predictedOd > newCutoff
        ? 'POSITIVE'
        : w.predictedOd > newCutoff * 0.85
        ? 'BORDERLINE'
        : 'NEGATIVE') as 'POSITIVE' | 'NEGATIVE' | 'BORDERLINE',
    }));
    const posCount = updatedResults.filter((w) => w.status === 'POSITIVE').length;
    const negCount = updatedResults.filter((w) => w.status === 'NEGATIVE').length;
    const updatedSummary = {
      ...analysisOutput.summary,
      cutoffValue: newCutoff,
      positiveCount: posCount,
      negativeCount: negCount,
      outbreakAlert: posCount > 0,
    };
    setAnalysisOutput({
      ...analysisOutput,
      results: updatedResults,
      summary: updatedSummary,
    });
  };

  const handleDownloadPdf = async () => {
    if (!analysisOutput) return;
    setIsGeneratingPdf(true);
    try {
      const pdfBytes = await generateClinicalPdfReport(
        analysisOutput.results,
        analysisOutput.summary,
        farmMetadata.farmName,
        currentPlateTitle,
        farmMetadata
      );
      downloadPdf(pdfBytes, `WSSA_Diagnostic_Report_${Date.now()}.pdf`);
    } catch (err) {
      console.error('PDF error:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExportCsv = () => {
    if (!analysisOutput) return;
    const csvStr = generatePlateCsv(
      analysisOutput.results,
      analysisOutput.summary,
      analysisOutput.numCols,
      currentPlateTitle,
      farmMetadata
    );
    downloadCsv(csvStr, `WSSA_Diagnostic_Matrix_${Date.now()}.csv`);
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-12">
      {/* Copied Toast */}
      {copiedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-slate-950 px-4 py-2 rounded-full font-bold text-xs shadow-2xl flex items-center gap-1.5 animate-in fade-in slide-in-from-top-4 duration-200">
          <Check className="w-4 h-4" />
          <span>Matrix Copied to Clipboard!</span>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-2.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-sky-500/20 text-xl">
            🦐
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white leading-tight">
              WSSA Mobile Reader
            </h1>
            <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
              <WifiOff className="w-3 h-3" /> 100% Offline • Landscape AI
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsMetadataOpen(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 transition-all"
            title="Specimen & Farm Metadata"
          >
            <Building2 className="w-5 h-5" />
          </button>

          <button
            onClick={() => setIsHistoryOpen(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 transition-all"
            title="Offline Test History & Trends"
          >
            <Clock className="w-5 h-5" />
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 transition-all"
            title="Upload Photo"
          >
            <Upload className="w-5 h-5" />
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
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 active:scale-95 transition-all"
          >
            <Camera className="w-4 h-4" />
            <span>Camera</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-lg w-full mx-auto p-3.5 space-y-3.5">
        {/* Farm & Specimen Banner */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl px-3.5 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 truncate">
            <Building2 className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="truncate">
              <span className="font-bold text-white block truncate">{farmMetadata.farmName}</span>
              <span className="text-[10px] text-slate-400">{farmMetadata.pondId} • {farmMetadata.species}</span>
            </div>
          </div>
          <button
            onClick={() => setIsMetadataOpen(true)}
            className="text-[10px] text-sky-400 hover:underline font-bold shrink-0 ml-2"
          >
            Edit
          </button>
        </div>

        {/* Sample Plate Selector */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-3 shadow-md">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5 flex items-center justify-between">
            <span>Select Microplate Sample</span>
            <span className="text-emerald-400 lowercase font-normal flex items-center gap-0.5">
              <Sparkles className="w-3 h-3" /> instant test
            </span>
          </label>
          <select
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
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

        {/* Progress Bar */}
        {progress && progress.stage !== 'done' && progress.stage !== 'idle' && (
          <div className="bg-slate-900 border border-sky-900/60 rounded-2xl p-4 shadow-xl animate-pulse">
            <div className="flex justify-between text-xs font-semibold mb-1.5">
              <span className="text-sky-300 flex items-center gap-1.5">
                <Activity className="w-4 h-4 animate-spin" /> {progress.message}
              </span>
              <span className="text-sky-400 font-mono">{progress.progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Diagnostic Results Section */}
        {analysisOutput && (
          <>
            {/* Outbreak Alert Card */}
            <OutbreakAlertCard
              summary={analysisOutput.summary}
              onDownloadPdf={handleDownloadPdf}
              isGeneratingPdf={isGeneratingPdf}
            />

            {/* Optical Illumination & Glare Quality Scorecard */}
            {analysisOutput.quality && (
              <OpticalQualityCard quality={analysisOutput.quality} />
            )}

            {/* Diagnostic Cut-off Tuning Slider */}
            <CutoffTuningControl
              summary={analysisOutput.summary}
              onCutoffChange={handleCutoffChange}
            />

            {/* 1-Tap Data Export Action Bar */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="py-2.5 px-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow"
              >
                <FileDown className="w-3.5 h-3.5 text-red-400" />
                <span>{isGeneratingPdf ? 'PDF...' : 'PDF Cert'}</span>
              </button>

              <button
                onClick={handleExportCsv}
                className="py-2.5 px-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={handleCopyMatrix}
                className="py-2.5 px-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow"
              >
                <Copy className="w-3.5 h-3.5 text-sky-400" />
                <span>Copy Grid</span>
              </button>
            </div>

            {/* View Mode Toggle Tabs */}
            <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
              <button
                onClick={() => setSelectedTab('grid')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  selectedTab === 'grid'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Interactive Grid</span>
              </button>

              <button
                onClick={() => setSelectedTab('overlay')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  selectedTab === 'overlay'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Detection View</span>
              </button>

              <button
                onClick={() => setSelectedTab('matrix')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  selectedTab === 'matrix'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Matrix (A-H)</span>
              </button>
            </div>

            {/* Tab 1: Interactive Microplate Grid */}
            {selectedTab === 'grid' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="font-semibold text-slate-300">Tap any well to inspect meniscus</span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Inference: {analysisOutput.durationMs}ms
                  </span>
                </div>

                <MicroplateGrid
                  results={analysisOutput.results}
                  numCols={analysisOutput.numCols}
                  selectedWell={selectedWell}
                  onSelectWell={(w) => setSelectedWell(w)}
                />

                {/* Status Legend */}
                <div className="flex justify-center gap-4 text-[11px] text-slate-400 pt-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-emerald-600" />
                    <span>Negative (&lt; Cutoff)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span>Borderline</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-600" />
                    <span>Positive (&gt; Cutoff)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: YOLO Detection Overlay View */}
            {selectedTab === 'overlay' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-xl overflow-hidden">
                <img
                  src={analysisOutput.annotatedImageUrl}
                  alt="Detection Overlay"
                  className="w-full rounded-xl object-contain max-h-[420px]"
                />
                <p className="text-[11px] text-slate-400 text-center py-2">
                  YOLOv8 Nano ONNX detected liquid cores with 8-DOF Projective Homography lattice lock.
                </p>
              </div>
            )}

            {/* Tab 3: Numerical OD Matrix Spreadsheet */}
            {selectedTab === 'matrix' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-xl space-y-2">
                <div className="flex justify-between items-center px-1">
                  <span className="text-xs font-bold text-white">Optical Density (450nm) Matrix</span>
                  <button
                    onClick={handleCopyMatrix}
                    className="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800"
                  >
                    <Copy className="w-3 h-3" /> Copy Matrix
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
                        <tr key={rowLetter} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                          <td className="p-1.5 font-bold text-slate-400">{rowLetter}</td>
                          {Array.from({ length: analysisOutput.numCols }, (_, c) => {
                            const well = analysisOutput.results.find(
                              (w) => w.row === rowLetter && w.col === c + 1
                            );
                            const isPos = well && well.predictedOd > analysisOutput.summary.cutoffValue;
                            return (
                              <td
                                key={c}
                                className={`p-1.5 font-bold ${
                                  isPos ? 'text-red-400' : 'text-slate-200'
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
          </>
        )}
      </main>

      {/* Camera Modal */}
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

      {/* Farm & Specimen Metadata Modal */}
      <MetadataModal
        isOpen={isMetadataOpen}
        initialMetadata={farmMetadata}
        onClose={() => setIsMetadataOpen(false)}
        onSave={(meta) => setFarmMetadata(meta)}
      />

      {/* Offline History Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onLoadRecord={(record) => {
          setCurrentPlateTitle(record.title);
          if (record.metadata) setFarmMetadata(record.metadata);
          setAnalysisOutput({
            results: record.results,
            summary: record.summary,
            annotatedImageUrl: record.thumbnailUrl || '',
            numCols: record.numCols,
            durationMs: 0,
            quality: record.quality,
            metadata: record.metadata,
          });
        }}
      />
    </div>
  );
};
export default App;
