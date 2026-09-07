import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, X, Focus, RotateCw } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (canvas: HTMLCanvasElement) => void;
}

const checkLandscape = () => {
  if (typeof window === 'undefined') return false;
  if (window.screen?.orientation?.type) {
    return window.screen.orientation.type.includes('landscape');
  }
  if (typeof window.orientation !== 'undefined') {
    return Math.abs(Number(window.orientation)) === 90;
  }
  return window.innerWidth > window.innerHeight;
};

export const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [focusPulse, setFocusPulse] = useState<{ x: number; y: number } | null>(null);

  // Track landscape vs portrait
  const [isLandscape, setIsLandscape] = useState<boolean>(checkLandscape);

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(checkLandscape());
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', handleResize);
    }
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', handleResize);
      }
    };
  }, []);

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
          // fallback
        }
      }

      if (!newStream) {
        throw new Error('Unable to access rear camera');
      }

      // Apply continuous auto-focus if hardware supports
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
    setTimeout(() => setFocusPulse(null), 1000);

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

    // Canonical landscape format (Width >= Height)
    if (vh > vw) {
      // Rotated 90 deg clockwise into horizontal
      canvas.width = vh;
      canvas.height = vw;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(vh / 2, vw / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    } else {
      // Natural horizontal
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
    <div className="fixed inset-0 z-50 bg-black select-none overflow-hidden font-sans flex flex-row">
      {/* 1. When in Portrait Mode: Camera is Inactive with Rotate to Landscape Screen */}
      {!isLandscape ? (
        <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col justify-between p-6 select-none animate-fadeIn">
          {/* Top Bar with Safe Notch Clearance */}
          <div
            style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 24px)' }}
            className="w-full flex justify-between items-center"
          >
            <button
              onClick={onClose}
              className="p-3 rounded-full bg-slate-900 text-slate-300 hover:text-white border border-slate-800 shadow-xl active:scale-90 transition-all cursor-pointer"
              title="Close Camera"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-widest bg-slate-900/90 px-3 py-1 rounded-full border border-slate-800">
              Landscape Required
            </span>
          </div>

          {/* Center Rotation Indication Graphic */}
          <div className="flex flex-col items-center text-center max-w-xs mx-auto space-y-6 my-auto">
            {/* Animated Device Rotation Graphic */}
            <div className="relative w-32 h-32 flex items-center justify-center">
              <div className="absolute inset-0 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 animate-pulse" />
              <div className="relative flex flex-col items-center justify-center gap-2 text-emerald-400">
                <RotateCw className="w-14 h-14 animate-[spin_3s_ease-in-out_infinite]" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Rotate Phone to Landscape
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                The camera is inactive in portrait mode. Turn your phone horizontally to activate the camera and capture the 96-well plate.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-400 shadow-inner">
              <span>96-Well (12 × 8) Alignment</span>
            </div>
          </div>

          {/* Bottom Guidance */}
          <div
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)' }}
            className="text-center text-xs text-slate-500 font-medium"
          >
            Hold phone with home screen / shutter on the right
          </div>
        </div>
      ) : (
        /* 2. When in Landscape Mode: Camera is Live, Focused, and Ready to Capture */
        <>
          {/* Viewfinder Main Area */}
          <div
            className="relative flex-1 h-full w-full flex items-center justify-center overflow-hidden bg-black cursor-crosshair"
            onClick={handleTapToFocus}
          >
            {/* Top Controls: Close button & Autofocus status */}
            <div
              style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
              }}
              className="absolute top-0 left-0 right-0 z-40 px-4 pb-2 flex justify-between items-center pointer-events-none"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="pointer-events-auto p-2.5 rounded-full bg-slate-900/80 backdrop-blur-md text-white border border-slate-700/80 active:scale-90 transition-all shadow-xl hover:bg-slate-800"
                title="Close Camera"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="pointer-events-auto bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-full border border-slate-700/80 flex items-center gap-1.5 shadow-xl">
                <Focus className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span className="text-[10px] font-semibold text-white tracking-tight">Auto-Focus</span>
              </div>
            </div>

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

                {/* Tap Focus Ring */}
                {focusPulse && (
                  <div
                    className="absolute pointer-events-none z-30 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-emerald-400 animate-ping opacity-90"
                    style={{ left: `${focusPulse.x}px`, top: `${focusPulse.y}px` }}
                  />
                )}

                {/* Perfect Landscape 1.5:1 (12:8) Plate Alignment Reticle */}
                <div
                  style={{
                    height: 'min(72vh, 400px)',
                    aspectRatio: '1.5 / 1',
                    maxHeight: '74vh',
                    maxWidth: 'min(70vw, 650px)',
                  }}
                  className="relative pointer-events-none rounded-2xl border-2 border-dashed border-emerald-400/90 bg-emerald-950/10 shadow-2xl flex flex-col justify-between p-3.5 backdrop-blur-[0.5px] transition-all duration-150"
                >
                  {/* Top Row Label */}
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-mono font-bold text-emerald-300 px-2 py-0.5 bg-slate-950/90 rounded-md border border-emerald-500/40 shadow-sm">
                      ROW A (TOP) • 12 COLS
                    </span>
                    <span className="text-[9px] font-mono text-emerald-200/80 px-1.5 py-0.5 bg-black/60 rounded">
                      96-WELL
                    </span>
                  </div>

                  {/* Center Alignment Crosshair */}
                  <div className="self-center flex flex-col items-center gap-1 opacity-75">
                    <div className="w-6 h-0.5 bg-emerald-400" />
                    <div className="h-6 w-0.5 bg-emerald-400 -mt-3.5" />
                    <span className="text-[10px] font-sans font-semibold text-white bg-black/75 px-2 py-0.5 rounded shadow-sm">
                      Align 96-well plate inside box
                    </span>
                  </div>

                  {/* Bottom Row Label */}
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-mono text-emerald-200/80 px-1.5 py-0.5 bg-black/60 rounded">
                      COL 1–12
                    </span>
                    <span className="text-[11px] font-mono font-bold text-emerald-300 px-2 py-0.5 bg-slate-950/90 rounded-md border border-emerald-500/40 shadow-sm self-end">
                      ROW H (BOTTOM)
                    </span>
                  </div>

                  {/* Corner Brackets */}
                  <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl shadow-sm" />
                  <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl shadow-sm" />
                  <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl shadow-sm" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-xl shadow-sm" />
                </div>
              </>
            )}
          </div>

          {/* Shutter Action Bar: vertical right-hand panel for right thumb */}
          <div
            style={{
              paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)',
            }}
            className="w-24 h-full bg-slate-950/85 border-l border-slate-800/80 flex flex-col items-center justify-center gap-3 z-30 shadow-2xl"
          >
            <button
              onClick={handleSnap}
              disabled={!!errorMsg}
              className="w-18 h-18 rounded-full border-4 border-white bg-emerald-500 hover:bg-emerald-400 active:scale-90 flex items-center justify-center shadow-2xl shadow-emerald-500/50 transition-all cursor-pointer"
              title="Capture Photo"
            >
              <Camera className="w-8 h-8 text-slate-950" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};
