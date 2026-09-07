import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera,
  X,
  RefreshCw,
  AlertCircle,
  Zap,
  ShieldCheck,
  Flashlight,
  Smartphone,
  Compass,
} from 'lucide-react';
import { detectWellsYolo, type RawBox } from '../core/yoloDetector';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (canvas: HTMLCanvasElement) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Landscape orientation state
  const [isLandscape, setIsLandscape] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth >= window.innerHeight : true
  );
  const [overridePortrait, setOverridePortrait] = useState<boolean>(false);

  // Hardware torch state
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);

  // Live detection HUD state
  const [detectedCount, setDetectedCount] = useState<number>(0);
  const [isPlateLocked, setIsPlateLocked] = useState<boolean>(false);
  const [tiltDegrees, setTiltDegrees] = useState<number>(0);
  const [autoCapture, setAutoCapture] = useState<boolean>(true);
  const [lockTimer, setLockTimer] = useState<number>(0);

  const isDetectingRef = useRef<boolean>(false);
  const lockCounterRef = useRef<number>(0);

  // Orientation listener
  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth >= window.innerHeight);
    };
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setTorchOn(false);
  }, [stream]);

  const startCamera = useCallback(async () => {
    setErrorMsg(null);
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      // Check torch capability
      const track = newStream.getVideoTracks()[0];
      if (track) {
        const caps: any = track.getCapabilities?.();
        setHasTorch(Boolean(caps?.torch));
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setErrorMsg('Could not access camera. Please grant camera permissions or use photo upload.');
    }
  }, [facingMode, stream]);

  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: next }],
      });
      setTorchOn(next);
    } catch (err) {
      console.warn('Torch toggle not supported on this track:', err);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    startCamera();
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  const handleSnap = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    let vw = video.videoWidth || 1920;
    let vh = video.videoHeight || 1080;

    // Enforce landscape output (W >= H) for 12x8 ANSI microplate geometry
    if (vh > vw) {
      canvas.width = vh;
      canvas.height = vw;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(vh / 2, vw / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    } else {
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, vw, vh);
    }

    stopCamera();
    onCapture(canvas);
    onClose();
  }, [onCapture, onClose, stopCamera]);

  // Real-Time Frame Detection Loop (~4-5 FPS)
  useEffect(() => {
    if (!isOpen || !stream) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      if (!videoRef.current || !overlayCanvasRef.current || isDetectingRef.current) return;
      const video = videoRef.current;
      if (video.readyState < 2) return;

      isDetectingRef.current = true;
      try {
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = 640;
        sampleCanvas.height = 640;
        const sCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })!;
        sCtx.drawImage(video, 0, 0, 640, 640);

        const boxes: RawBox[] = await detectWellsYolo(sampleCanvas, 0.20);
        if (!isMounted) return;

        const overlay = overlayCanvasRef.current;
        if (!overlay) return;
        overlay.width = overlay.clientWidth;
        overlay.height = overlay.clientHeight;
        const oCtx = overlay.getContext('2d')!;
        oCtx.clearRect(0, 0, overlay.width, overlay.height);

        const count = boxes.length;
        setDetectedCount(count);

        const scaleX = overlay.width / 640;
        const scaleY = overlay.height / 640;

        const locked = count >= 45;
        setIsPlateLocked(locked);

        const strokeColor = locked ? '#10B981' : '#38BDF8';
        const fillColor = locked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)';

        for (const b of boxes) {
          const cx = b.cx * scaleX;
          const cy = b.cy * scaleY;
          const r = Math.max((b.w * scaleX) / 2, 4);

          oCtx.beginPath();
          oCtx.arc(cx, cy, r, 0, 2 * Math.PI);
          oCtx.fillStyle = fillColor;
          oCtx.fill();
          oCtx.lineWidth = 2;
          oCtx.strokeStyle = strokeColor;
          oCtx.stroke();

          oCtx.beginPath();
          oCtx.arc(cx, cy, 2, 0, 2 * Math.PI);
          oCtx.fillStyle = '#FFFFFF';
          oCtx.fill();
        }

        if (boxes.length >= 8) {
          const cys = boxes.map((b) => b.cy);
          const cxs = boxes.map((b) => b.cx);
          const dy = Math.max(...cys) - Math.min(...cys);
          const dx = Math.max(...cxs) - Math.min(...cxs);
          const ratio = dy / Math.max(dx, 1);
          const tilt = Math.abs(ratio - (8 / 12)) * 15;
          setTiltDegrees(Math.round(tilt * 10) / 10);
        }

        if (locked) {
          lockCounterRef.current += 1;
          setLockTimer(Math.min(lockCounterRef.current * 25, 100));

          if (autoCapture && lockCounterRef.current >= 4) {
            handleSnap();
          }
        } else {
          lockCounterRef.current = 0;
          setLockTimer(0);
        }
      } catch (err) {
        console.warn('Live detection frame error:', err);
      } finally {
        isDetectingRef.current = false;
      }
    }, 240);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, stream, autoCapture, handleSnap]);

  if (!isOpen) return null;

  // Portrait Mode Interstitial Guide
  const showPortraitWarning = !isLandscape && !overridePortrait;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none overflow-hidden font-sans">
      {/* Portrait Mode Guidance Screen */}
      {showPortraitWarning && (
        <div className="absolute inset-0 z-40 bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center text-white space-y-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl bg-sky-500/10 border-2 border-sky-400 flex items-center justify-center text-sky-400 shadow-2xl shadow-sky-500/30 animate-pulse">
              <Smartphone className="w-12 h-12 transform rotate-90 transition-transform duration-700" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold">
              ✓
            </div>
          </div>

          <div className="space-y-2 max-w-xs">
            <h2 className="text-xl font-black tracking-tight text-white uppercase">
              Rotate Phone to Landscape
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Standard 96-well microplates (12 columns × 8 rows) require horizontal landscape
              capture for maximum optical resolution and sub-pixel accuracy.
            </p>
          </div>

          <div className="space-y-3 w-full max-w-xs pt-2">
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-[11px] text-slate-400 flex items-center justify-center gap-2">
              <Compass className="w-4 h-4 text-emerald-400" />
              <span>Turn phone 90° sideways to unlock HUD</span>
            </div>

            <button
              onClick={() => setOverridePortrait(true)}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 active:scale-95 transition-all"
            >
              Continue in Portrait (Auto-Rotated)
            </button>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="flex justify-between items-center px-4 py-2 bg-slate-950/85 backdrop-blur-md z-30 border-b border-slate-800/80">
        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-slate-800/80 text-white hover:bg-slate-700 active:scale-90 transition-transform"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Lock Status Badge */}
        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
              isPlateLocked
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/60 shadow-emerald-500/20'
                : detectedCount > 15
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            {isPlateLocked ? (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>LOCKED ({detectedCount} WELLS)</span>
              </>
            ) : detectedCount > 15 ? (
              <>
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>ALIGNING ({detectedCount} WELLS)</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>SEARCHING FOR PLATE...</span>
              </>
            )}
          </div>

          {/* Electronic Spirit Level Horizon Indicator */}
          <div
            className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold flex items-center gap-1 border transition-all ${
              tiltDegrees <= 4
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/50'
                : 'bg-amber-950/60 text-amber-400 border-amber-500/50'
            }`}
          >
            <Compass className="w-3 h-3" />
            <span>{tiltDegrees <= 4 ? `● LEVEL (${tiltDegrees}°)` : `▲ TILT (${tiltDegrees}°)`}</span>
          </div>
        </div>

        {/* Auto-Snap Toggle */}
        <button
          onClick={() => setAutoCapture(!autoCapture)}
          className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${
            autoCapture
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          Auto: {autoCapture ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Main Viewfinder Area */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-slate-950">
        {errorMsg ? (
          <div className="p-6 text-center text-red-400 max-w-sm">
            <p className="text-sm">{errorMsg}</p>
          </div>
        ) : (
          <>
            {/* Live Camera Stream */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Real-time Well Bounding Reticles Canvas Layer */}
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
            />

            {/* Landscape 12:8 Microplate Reticle Frame Guide */}
            <div
              className={`relative pointer-events-none w-[90%] max-w-2xl aspect-[1.5/1] rounded-2xl border-2 transition-all duration-300 flex flex-col justify-between p-3 ${
                isPlateLocked
                  ? 'border-emerald-400 bg-emerald-950/10 shadow-[0_0_50px_rgba(16,185,129,0.35)]'
                  : 'border-slate-400/50 bg-slate-950/15'
              }`}
            >
              {/* Corner brackets */}
              <div className={`absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 rounded-tl-xl ${isPlateLocked ? 'border-emerald-400' : 'border-white'}`} />
              <div className={`absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 rounded-tr-xl ${isPlateLocked ? 'border-emerald-400' : 'border-white'}`} />
              <div className={`absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 rounded-bl-xl ${isPlateLocked ? 'border-emerald-400' : 'border-white'}`} />
              <div className={`absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 rounded-br-xl ${isPlateLocked ? 'border-emerald-400' : 'border-white'}`} />

              <div className="flex justify-between items-center text-[11px] font-mono text-slate-200 font-bold px-1 bg-black/40 rounded px-2 py-0.5 backdrop-blur-sm self-start">
                <span>ROW A (TOP) • 12 COLUMNS</span>
              </div>

              {/* Auto-snap countdown ring */}
              {autoCapture && lockTimer > 0 && (
                <div className="self-center flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full border-4 border-emerald-400/30 border-t-emerald-400 animate-spin flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <span className="text-xs font-bold text-emerald-300 font-mono">{lockTimer}%</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-300 mt-1 uppercase tracking-widest bg-black/60 px-2 py-0.5 rounded">
                    HOLD STEADY
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center text-[10px] font-mono text-slate-300 px-1 bg-black/40 rounded px-2 py-0.5 backdrop-blur-sm self-end">
                <span>ROW H (BOTTOM) • ANSI/SLAS 96-WELL</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right/Bottom Ergonomic Controls Bar */}
      <div className="h-24 bg-slate-950/90 backdrop-blur-md flex items-center justify-around px-8 z-30 border-t border-slate-800">
        {/* Torch Button */}
        <button
          onClick={toggleTorch}
          disabled={!hasTorch}
          className={`p-3 rounded-2xl flex flex-col items-center gap-1 transition-all active:scale-90 ${
            torchOn
              ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/30'
              : hasTorch
              ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              : 'bg-slate-900 text-slate-600 opacity-40 cursor-not-allowed'
          }`}
          title="Toggle Torch / Flashlight"
        >
          <Flashlight className="w-5 h-5" />
          <span className="text-[9px] uppercase font-bold">{torchOn ? 'Torch On' : 'Torch'}</span>
        </button>

        {/* Large Ergonomic Shutter Button */}
        <button
          onClick={handleSnap}
          disabled={!!errorMsg}
          className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all active:scale-90 shadow-2xl ${
            isPlateLocked
              ? 'border-emerald-400 bg-emerald-500 shadow-emerald-500/50 scale-105'
              : 'border-white bg-slate-800 hover:bg-slate-700 shadow-black/60'
          }`}
          title="Capture Microplate"
        >
          <Camera className="w-8 h-8 text-white" />
        </button>

        {/* Camera Flip Button */}
        <button
          onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
          className="p-3 rounded-2xl bg-slate-800 text-slate-300 hover:bg-slate-700 flex flex-col items-center gap-1 active:scale-90 transition-transform"
          title="Flip Camera"
        >
          <RefreshCw className="w-5 h-5" />
          <span className="text-[9px] uppercase font-bold">Flip</span>
        </button>
      </div>
    </div>
  );
};

