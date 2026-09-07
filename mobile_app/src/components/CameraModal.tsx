import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, RefreshCw, CheckCircle2 } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (canvas: HTMLCanvasElement) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    startCamera();
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
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
      setErrorMsg('Could not access camera. Please allow camera permissions or upload a photo.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleSnap = () => {
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
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between">
      {/* Top Header Controls */}
      <div className="flex justify-between items-center px-4 py-3 bg-black/60 backdrop-blur-sm z-10">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-slate-800/80 text-white hover:bg-slate-700"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="text-center">
          <span className="text-sm font-semibold text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> Align 96-Well Plate
          </span>
          <p className="text-xs text-slate-300">Keep plate inside rectangular reticle</p>
        </div>

        <button
          onClick={toggleFacingMode}
          className="p-2 rounded-full bg-slate-800/80 text-white hover:bg-slate-700"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Main Viewfinder with 96-Well Grid Reticle */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-slate-950">
        {errorMsg ? (
          <div className="p-6 text-center text-red-400 max-w-sm">
            <p className="text-sm">{errorMsg}</p>
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

            {/* 96-Well Viewfinder Alignment Reticle Overlay */}
            <div className="relative pointer-events-none w-[90%] max-w-md aspect-[1.45/1] border-2 border-emerald-400/80 rounded-xl shadow-[0_0_30px_rgba(16,185,129,0.3)] flex flex-col justify-between p-3 bg-emerald-950/10">
              {/* Corner Accents */}
              <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-md" />
              <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-md" />
              <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-md" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-md" />

              {/* Grid Outline Dots */}
              <div className="flex-1 grid grid-cols-12 grid-rows-8 gap-1 opacity-40">
                {Array.from({ length: 96 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-full h-full rounded-full border border-emerald-300/40 flex items-center justify-center"
                  />
                ))}
              </div>

              {/* Reticle Guide Text */}
              <div className="text-center mt-1">
                <span className="text-[10px] font-mono tracking-wider text-emerald-300 bg-slate-900/80 px-2 py-0.5 rounded-full">
                  ROW A (TOP) → ROW H (BOTTOM)
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom Shutter Action Bar */}
      <div className="h-28 bg-black/80 backdrop-blur-md flex items-center justify-center px-8 z-10">
        <button
          onClick={handleSnap}
          disabled={!!errorMsg}
          className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-transform shadow-lg shadow-emerald-500/30 disabled:opacity-50"
        >
          <Camera className="w-8 h-8 text-white" />
        </button>
      </div>
    </div>
  );
};
