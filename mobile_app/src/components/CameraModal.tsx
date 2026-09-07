import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, X, RefreshCw, AlertCircle, Zap, ShieldCheck } from 'lucide-react';
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

  // Live detection HUD state
  const [detectedCount, setDetectedCount] = useState<number>(0);
  const [isPlateLocked, setIsPlateLocked] = useState<boolean>(false);
  const [tiltDegrees, setTiltDegrees] = useState<number>(0);
  const [autoCapture, setAutoCapture] = useState<boolean>(true);
  const [lockTimer, setLockTimer] = useState<number>(0);

  const isDetectingRef = useRef<boolean>(false);
  const lockCounterRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
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
    } catch (err: any) {
      console.error('Camera access error:', err);
      setErrorMsg('Could not access camera. Please grant camera permissions or use photo upload.');
    }
  }, [facingMode, stream]);

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
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

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
        // Offscreen sampling canvas
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = 640;
        sampleCanvas.height = 640;
        const sCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })!;
        sCtx.drawImage(video, 0, 0, 640, 640);

        // Run on-device YOLOv8 inference in WebAssembly
        const boxes: RawBox[] = await detectWellsYolo(sampleCanvas, 0.20);

        if (!isMounted) return;

        // Overlay canvas
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

        // Check plate lock condition (at least 45 wells detected)
        const locked = count >= 45;
        setIsPlateLocked(locked);

        // Draw glowing bounding target rings for each detected well
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

          // Sub-pixel center point
          oCtx.beginPath();
          oCtx.arc(cx, cy, 2, 0, 2 * Math.PI);
          oCtx.fillStyle = '#FFFFFF';
          oCtx.fill();
        }

        // Calculate perspective tilt from bounding box distributions
        if (boxes.length >= 8) {
          const cys = boxes.map((b) => b.cy);
          const cxs = boxes.map((b) => b.cx);
          const dy = Math.max(...cys) - Math.min(...cys);
          const dx = Math.max(...cxs) - Math.min(...cxs);
          const ratio = dy / Math.max(dx, 1);
          const tilt = Math.abs(ratio - (8 / 12)) * 15;
          setTiltDegrees(Math.round(tilt * 10) / 10);
        }

        // Auto-capture stability counter
        if (locked) {
          lockCounterRef.current += 1;
          setLockTimer(Math.min(lockCounterRef.current * 25, 100));

          if (autoCapture && lockCounterRef.current >= 4) {
            // Plate locked steadily for ~1 second -> Auto-snap!
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

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none">
      {/* Top HUD Controls Bar */}
      <div className="flex justify-between items-center px-4 py-3 bg-slate-950/80 backdrop-blur-md z-20 border-b border-slate-800">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-slate-800 text-white hover:bg-slate-700 active:scale-90 transition-transform"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Live Lock Status Indicator */}
        <div className="flex flex-col items-center">
          <div
            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
              isPlateLocked
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-emerald-500/20 animate-pulse'
                : detectedCount > 15
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            {isPlateLocked ? (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>PLATE LOCKED ({detectedCount} WELLS)</span>
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

          <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400 font-mono">
            <span>Tilt: {tiltDegrees}° {tiltDegrees <= 4 ? '🟢 OK' : '🟡 LEVEL'}</span>
            <span>•</span>
            <button
              onClick={() => setAutoCapture(!autoCapture)}
              className={`font-sans font-semibold underline ${autoCapture ? 'text-emerald-400' : 'text-slate-400'}`}
            >
              Auto-Snap: {autoCapture ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <button
          onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
          className="p-2 rounded-full bg-slate-800 text-white hover:bg-slate-700 active:scale-90 transition-transform"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Main Viewfinder Area with Dynamic Overlay */}
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

            {/* Semi-transparent 96-well framing guide */}
            <div
              className={`relative pointer-events-none w-[88%] max-w-md aspect-[1.45/1] rounded-2xl border-2 transition-all duration-300 flex flex-col justify-between p-3 ${
                isPlateLocked
                  ? 'border-emerald-400 bg-emerald-950/10 shadow-[0_0_40px_rgba(16,185,129,0.35)]'
                  : 'border-slate-400/50 bg-slate-950/20'
              }`}
            >
              {/* Corner accents */}
              <div className={`absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 rounded-tl-lg ${isPlateLocked ? 'border-emerald-400' : 'border-white'}`} />
              <div className={`absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 rounded-tr-lg ${isPlateLocked ? 'border-emerald-400' : 'border-white'}`} />
              <div className={`absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 rounded-bl-lg ${isPlateLocked ? 'border-emerald-400' : 'border-white'}`} />
              <div className={`absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 rounded-br-lg ${isPlateLocked ? 'border-emerald-400' : 'border-white'}`} />

              <div className="flex justify-between items-center text-[11px] font-mono text-slate-300 font-bold px-1">
                <span>ROW A (TOP)</span>
                <span>COL 1 - 12</span>
              </div>

              {/* Auto-snap progress ring indicator */}
              {autoCapture && lockTimer > 0 && (
                <div className="self-center flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full border-4 border-emerald-400/30 border-t-emerald-400 animate-spin flex items-center justify-center">
                    <span className="text-xs font-bold text-emerald-300 font-mono">{lockTimer}%</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-300 mt-1">HOLD STEADY</span>
                </div>
              )}

              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 px-1">
                <span>ROW H (BOTTOM)</span>
                <span>ANSI / SLAS 96-WELL</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom Shutter Action Bar */}
      <div className="h-28 bg-slate-950/90 backdrop-blur-md flex items-center justify-between px-8 z-20 border-t border-slate-800">
        <div className="w-12 text-center text-xs text-slate-400 font-mono">
          <span className="text-lg font-bold text-white block">{detectedCount}</span>
          <span>Wells</span>
        </div>

        {/* Manual Shutter Button */}
        <button
          onClick={handleSnap}
          disabled={!!errorMsg}
          className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all active:scale-90 shadow-xl ${
            isPlateLocked
              ? 'border-emerald-400 bg-emerald-500 shadow-emerald-500/40 animate-bounce'
              : 'border-white bg-slate-800 hover:bg-slate-700 shadow-black/50'
          }`}
        >
          <Camera className="w-8 h-8 text-white" />
        </button>

        <div className="w-12 text-center text-xs text-slate-400">
          <span className="text-emerald-400 font-bold block">{isPlateLocked ? 'READY' : 'FRAME'}</span>
          <span>Status</span>
        </div>
      </div>
    </div>
  );
};
