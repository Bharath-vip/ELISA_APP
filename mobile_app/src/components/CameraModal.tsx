import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, X, Focus } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (canvas: HTMLCanvasElement) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [focusPulse, setFocusPulse] = useState<{ x: number; y: number } | null>(null);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  const startCamera = useCallback(async () => {
    setErrorMsg(null);
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      // Prioritize primary rear camera with continuous auto-focus constraints
      let newStream: MediaStream | null = null;
      const constraintsList: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { exact: 'environment' },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            // @ts-ignore
            focusMode: { ideal: 'continuous' },
          },
          audio: false,
        },
        {
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        },
        {
          video: true,
          audio: false,
        },
      ];

      for (const c of constraintsList) {
        try {
          newStream = await navigator.mediaDevices.getUserMedia(c);
          if (newStream) break;
        } catch {
          // try next fallback constraint
        }
      }

      if (!newStream) {
        throw new Error('Unable to access rear camera');
      }

      // Apply continuous auto-focus if supported by camera hardware
      const track = newStream.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities: any = track.getCapabilities?.() || {};
          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            await (track as any).applyConstraints({
              advanced: [{ focusMode: 'continuous' }],
            });
          }
        } catch (focusErr) {
          console.warn('Auto-focus constraint error:', focusErr);
        }
      }

      setStream(newStream);

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = newStream;
        video.onloadedmetadata = () => {
          video.play().catch(console.warn);
        };
        video.play().catch(console.warn);
      }
    } catch (err: any) {
      console.error('Rear camera access error:', err);
      setErrorMsg('Could not access rear camera. Please check camera permissions.');
    }
  }, [stream]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    startCamera();
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Tap to Focus trigger
  const handleTapToFocus = async (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    setFocusPulse({ x, y });
    setTimeout(() => setFocusPulse(null), 1200);

    // Request autofocus on track if available
    if (stream) {
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          await (track as any).applyConstraints({
            advanced: [{ focusMode: 'continuous' }],
          });
        } catch {}
      }
    }
  };

  const handleSnap = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const vw = video.videoWidth || 1920;
    const vh = video.videoHeight || 1080;

    const canvas = document.createElement('canvas');

    // Guarantee canonical landscape format (Width >= Height)
    if (vh > vw) {
      // Rotated 90 degrees clockwise to horizontal
      canvas.width = vh;
      canvas.height = vw;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(vh / 2, vw / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    } else {
      // Natural landscape
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, vw, vh);
    }

    stopCamera();
    onCapture(canvas);
    onClose();
  }, [onCapture, onClose, stopCamera]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none overflow-hidden font-sans">
      {/* Top Header: Close Button with Safe Notch Clearance */}
      <div
        style={{ paddingTop: 'var(--safe-top, 38px)' }}
        className="absolute top-0 left-0 right-0 z-40 px-5 pb-3 flex justify-between items-center pointer-events-none"
      >
        <button
          onClick={onClose}
          className="pointer-events-auto p-3 rounded-full bg-slate-900/80 backdrop-blur-md text-white border border-slate-700/80 active:scale-90 transition-all shadow-xl"
          title="Close Camera"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="pointer-events-auto bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/80 flex items-center gap-1.5 shadow-xl">
          <Focus className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span className="text-[11px] font-semibold text-white tracking-tight">Auto-Focus On</span>
        </div>
      </div>

      {/* Main Viewfinder Area with Tap-to-Focus */}
      <div
        className="relative flex-1 flex items-center justify-center overflow-hidden bg-black cursor-crosshair"
        onClick={handleTapToFocus}
      >
        {errorMsg ? (
          <div className="p-6 text-center text-red-400 max-w-sm z-30">
            <p className="text-sm font-semibold">{errorMsg}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Tap Focus Ring Indicator */}
            {focusPulse && (
              <div
                className="absolute pointer-events-none z-30 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full border-2 border-emerald-400 animate-ping opacity-90"
                style={{ left: `${focusPulse.x}px`, top: `${focusPulse.y}px` }}
              />
            )}

            {/* Clean Landscape 1.5:1 (12:8) Plate Alignment Box Overlay */}
            <div className="relative pointer-events-none w-[88vw] max-w-3xl aspect-[1.5/1] max-h-[78vh] rounded-2xl border-2 border-dashed border-emerald-400/90 bg-emerald-950/10 shadow-2xl flex flex-col justify-between p-4 backdrop-blur-[0.5px]">
              {/* Top Row Label */}
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono font-bold text-emerald-300 px-2.5 py-1 bg-slate-950/90 rounded-md border border-emerald-500/40 shadow-sm">
                  ROW A (TOP) • 12 COLUMNS
                </span>
                <span className="text-[10px] font-mono text-emerald-200/80 px-2 py-0.5 bg-black/60 rounded">
                  96-WELL PLATE
                </span>
              </div>

              {/* Center Crosshair for Flatness Alignment */}
              <div className="self-center flex flex-col items-center gap-1.5 opacity-80">
                <div className="w-8 h-0.5 bg-emerald-400" />
                <div className="h-8 w-0.5 bg-emerald-400 -mt-4.5" />
                <span className="text-[11px] font-sans font-semibold text-white bg-black/75 px-2.5 py-0.5 rounded shadow-sm">
                  Align plate inside box
                </span>
              </div>

              {/* Bottom Row Label */}
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-emerald-200/80 px-2 py-0.5 bg-black/60 rounded">
                  COL 1–12
                </span>
                <span className="text-xs font-mono font-bold text-emerald-300 px-2.5 py-1 bg-slate-950/90 rounded-md border border-emerald-500/40 shadow-sm self-end">
                  ROW H (BOTTOM)
                </span>
              </div>

              {/* High-Contrast Bold Corner Brackets */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl shadow-sm" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl shadow-sm" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl shadow-sm" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl shadow-sm" />
            </div>
          </>
        )}
      </div>

      {/* Bottom Shutter Bar */}
      <div
        style={{ paddingBottom: 'var(--safe-bottom, 16px)' }}
        className="h-28 bg-gradient-to-t from-black via-slate-950/90 to-transparent flex items-center justify-center px-8 z-30"
      >
        {/* Shutter Button */}
        <button
          onClick={handleSnap}
          disabled={!!errorMsg}
          className="w-20 h-20 rounded-full border-4 border-white bg-emerald-500 hover:bg-emerald-400 active:scale-90 flex items-center justify-center shadow-2xl shadow-emerald-500/50 transition-all"
          title="Capture Photo"
        >
          <Camera className="w-10 h-10 text-slate-950" />
        </button>
      </div>
    </div>
  );
};
