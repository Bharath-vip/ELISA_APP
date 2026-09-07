import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, X, RefreshCw, Flashlight } from 'lucide-react';
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

  // Hardware torch state
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);

  // Live detection state
  const [detectedCount, setDetectedCount] = useState<number>(0);
  const [isPlateLocked, setIsPlateLocked] = useState<boolean>(false);

  const isDetectingRef = useRef<boolean>(false);

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

      // Step 1: Enumerate cameras to target rear/back camera specifically
      let selectedDeviceId: string | undefined;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');

        if (facingMode === 'environment') {
          // Find back / rear camera by label
          const backDevice = videoInputs.find((d) =>
            /back|rear|environment/i.test(d.label)
          );
          if (backDevice) {
            selectedDeviceId = backDevice.deviceId;
          } else if (videoInputs.length > 1) {
            // On many Android phones without permission labels, the last device is often the rear main camera
            selectedDeviceId = videoInputs[videoInputs.length - 1].deviceId;
          }
        } else {
          const frontDevice = videoInputs.find((d) =>
            /front|user|selfie/i.test(d.label)
          );
          if (frontDevice) {
            selectedDeviceId = frontDevice.deviceId;
          }
        }
      } catch (enumErr) {
        console.warn('Device enumeration error:', enumErr);
      }

      // Step 2: Try to acquire video with fallback chain
      let newStream: MediaStream | null = null;
      const constraintsList: MediaStreamConstraints[] = [
        ...(selectedDeviceId
          ? [{ video: { deviceId: { exact: selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }]
          : []),
        { video: { facingMode: { exact: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        { video: { facingMode: facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        { video: true, audio: false },
      ];

      for (const c of constraintsList) {
        try {
          newStream = await navigator.mediaDevices.getUserMedia(c);
          if (newStream) break;
        } catch (e) {
          // try next constraint
        }
      }

      if (!newStream) {
        throw new Error('Unable to access camera stream');
      }

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
      setErrorMsg('Could not access camera. Please check camera permissions.');
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
      console.warn('Torch not supported:', err);
    }
  };

  const switchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
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

    // Guarantee landscape orientation (Width >= Height)
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

  // Real-time detection loop
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
        const locked = count >= 45;
        setIsPlateLocked(locked);

        const strokeColor = locked ? '#10B981' : '#38BDF8';
        const scaleX = overlay.width / 640;
        const scaleY = overlay.height / 640;

        for (const b of boxes) {
          const cx = b.cx * scaleX;
          const cy = b.cy * scaleY;
          const r = Math.max((b.w * scaleX) / 2, 3);

          oCtx.beginPath();
          oCtx.arc(cx, cy, r, 0, 2 * Math.PI);
          oCtx.lineWidth = 2;
          oCtx.strokeStyle = strokeColor;
          oCtx.stroke();
        }
      } catch (err) {
        // silent frame error
      } finally {
        isDetectingRef.current = false;
      }
    }, 250);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, stream]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none overflow-hidden font-sans">
      {/* Top Header Bar */}
      <div className="flex justify-between items-center px-4 py-3 bg-slate-950/80 backdrop-blur-md z-30 border-b border-slate-800">
        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-slate-800 text-white hover:bg-slate-700 active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Camera info / toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={switchCamera}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 active:scale-95 transition-all"
            title="Switch Camera"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{facingMode === 'environment' ? 'Rear Camera' : 'Front Camera'}</span>
          </button>

          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-xl border transition-all ${
                torchOn
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
              title="Flashlight"
            >
              <Flashlight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Viewfinder */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-slate-950">
        {errorMsg ? (
          <div className="p-6 text-center text-red-400 max-w-sm">
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

            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
            />

            {/* Clean 12:8 Landscape Reticle */}
            <div
              className={`relative pointer-events-none w-[90%] max-w-2xl aspect-[1.5/1] rounded-2xl border-2 transition-all duration-300 flex flex-col justify-between p-3 ${
                isPlateLocked
                  ? 'border-emerald-400 bg-emerald-950/10'
                  : 'border-white/50 bg-slate-950/10'
              }`}
            >
              <div className="flex justify-between items-center text-[10px] font-mono text-white/80 font-bold px-2 py-0.5 bg-black/40 rounded w-max">
                <span>ROW A (TOP) • 12 COLS</span>
              </div>

              <div className="flex justify-between items-center text-[10px] font-mono text-white/80 px-2 py-0.5 bg-black/40 rounded w-max self-end">
                <span>ROW H (BOTTOM)</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom Shutter Action Bar */}
      <div className="h-24 bg-slate-950/90 backdrop-blur-md flex items-center justify-between px-8 z-30 border-t border-slate-800">
        <div className="text-xs font-mono text-slate-400">
          <span className="text-white font-bold text-base block">{detectedCount}</span>
          <span>Wells</span>
        </div>

        {/* Shutter Button */}
        <button
          onClick={handleSnap}
          disabled={!!errorMsg}
          className={`w-18 h-18 rounded-full border-4 flex items-center justify-center transition-all active:scale-90 shadow-xl ${
            isPlateLocked
              ? 'border-emerald-400 bg-emerald-500 scale-105 shadow-emerald-500/40'
              : 'border-white bg-slate-800 hover:bg-slate-700'
          }`}
        >
          <Camera className="w-8 h-8 text-white" />
        </button>

        <div className="text-xs text-right">
          <span className={`font-bold block ${isPlateLocked ? 'text-emerald-400' : 'text-slate-400'}`}>
            {isPlateLocked ? 'LOCKED' : 'READY'}
          </span>
          <span className="text-[10px] text-slate-500">Landscape</span>
        </div>
      </div>
    </div>
  );
};
