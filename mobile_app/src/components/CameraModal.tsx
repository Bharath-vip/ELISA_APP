import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, X, RefreshCw, Flashlight, Smartphone, RotateCcw } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (canvas: HTMLCanvasElement) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState<number>(0);
  const [isRotated, setIsRotated] = useState<boolean>(false);

  // Hardware torch state
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);

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

      // Enumerate devices to know how many cameras are available
      let videoDevices: MediaDeviceInfo[] = [];
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = devices.filter((d) => d.kind === 'videoinput');
        setAvailableDevices(videoDevices);
      } catch (enumErr) {
        console.warn('Device enumeration error:', enumErr);
      }

      // Build prioritized constraint list
      // 1. If user specifically selected a device index from available devices with label
      const activeDev = videoDevices[currentDeviceIndex];
      const constraintsList: MediaStreamConstraints[] = [];

      if (activeDev && activeDev.deviceId) {
        constraintsList.push({
          video: {
            deviceId: { exact: activeDev.deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      }

      // 2. Standard facingMode ideal constraints (browser/OS picks best primary camera)
      constraintsList.push({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      // 3. Simple facingMode
      constraintsList.push({
        video: { facingMode: facingMode },
        audio: false,
      });

      // 4. Any video stream fallback
      constraintsList.push({ video: true, audio: false });

      let newStream: MediaStream | null = null;
      for (const c of constraintsList) {
        try {
          newStream = await navigator.mediaDevices.getUserMedia(c);
          if (newStream) break;
        } catch (e) {
          console.warn('Constraint attempt failed:', e);
        }
      }

      if (!newStream) {
        throw new Error('Unable to access camera stream');
      }

      setStream(newStream);

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = newStream;
        video.onloadedmetadata = () => {
          video.play().catch((playErr) => console.warn('Video play error:', playErr));
        };
        video.play().catch((playErr) => console.warn('Immediate video play error:', playErr));
      }

      // Check torch capability on the active track
      const track = newStream.getVideoTracks()[0];
      if (track) {
        const caps: any = track.getCapabilities?.();
        setHasTorch(Boolean(caps?.torch));
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setErrorMsg(
        'Camera stream could not be started. You can tap "Use System Camera" below to take a photo using your phone\'s camera app.'
      );
    }
  }, [facingMode, currentDeviceIndex, stream]);

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
    if (availableDevices.length > 1) {
      setCurrentDeviceIndex((prev) => (prev + 1) % availableDevices.length);
    } else {
      setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
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
  }, [isOpen, facingMode, currentDeviceIndex]);

  const handleSnap = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const vw = video.videoWidth || 1920;
    const vh = video.videoHeight || 1080;

    if (isRotated) {
      // Plate was aligned vertically (8 cols wide x 12 rows tall)
      // Rotate 90 degrees clockwise to normalize into standard 12 cols wide x 8 rows tall
      canvas.width = vh;
      canvas.height = vw;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(vh / 2, vw / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    } else {
      // Plate was aligned in standard horizontal box
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
    }

    stopCamera();
    onCapture(canvas);
    onClose();
  }, [isRotated, onCapture, onClose, stopCamera]);

  // Native System Camera Fallback Handler
  const handleSystemCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const vw = img.naturalWidth || img.width;
        const vh = img.naturalHeight || img.height;

        if (isRotated) {
          canvas.width = vh;
          canvas.height = vw;
          const ctx = canvas.getContext('2d')!;
          ctx.translate(vh / 2, vw / 2);
          ctx.rotate((90 * Math.PI) / 180);
          ctx.drawImage(img, -vw / 2, -vh / 2, vw, vh);
        } else {
          if (vh > vw) {
            canvas.width = vh;
            canvas.height = vw;
            const ctx = canvas.getContext('2d')!;
            ctx.translate(vh / 2, vw / 2);
            ctx.rotate((90 * Math.PI) / 180);
            ctx.drawImage(img, -vw / 2, -vh / 2, vw, vh);
          } else {
            canvas.width = vw;
            canvas.height = vh;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, vw, vh);
          }
        }

        stopCamera();
        onCapture(canvas);
        onClose();
      };
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none overflow-hidden font-sans">
      {/* Hidden Native System Camera Capture */}
      <input
        ref={fallbackInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleSystemCameraCapture}
      />

      {/* Top Header Bar with Safe Notch Spacing */}
      <div
        style={{ paddingTop: 'var(--safe-top, 38px)' }}
        className="flex justify-between items-center px-4 pb-3 bg-slate-950/90 backdrop-blur-md z-30 border-b border-slate-800/80"
      >
        <button
          onClick={onClose}
          className="p-2.5 rounded-xl bg-slate-800/90 text-white hover:bg-slate-700 active:scale-95 shadow-md"
          title="Close Camera"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* Rotate Reticle Toggle */}
          <button
            onClick={() => setIsRotated((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-all shadow-md ${
              isRotated
                ? 'bg-amber-500 text-slate-950 font-bold shadow-amber-500/20'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
            title="Rotate Reticle 90 Degrees"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isRotated ? '8×12 (Vert)' : '12×8 (Horiz)'}</span>
          </button>

          {/* Flip / Cycle Camera */}
          <button
            onClick={switchCamera}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 active:scale-95 transition-all shadow-md"
            title="Switch Camera Sensor"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>
              {availableDevices.length > 1
                ? `${currentDeviceIndex + 1}/${availableDevices.length}`
                : facingMode === 'environment'
                ? 'Rear'
                : 'Front'}
            </span>
          </button>

          {/* Torch Toggle */}
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-xl border transition-all shadow-md ${
                torchOn
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
              title="Flashlight"
            >
              <Flashlight className="w-4 h-4" />
            </button>
          )}

          {/* Direct System Camera Trigger */}
          <button
            onClick={() => fallbackInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-sky-600/90 hover:bg-sky-500 text-white text-xs font-semibold active:scale-95 transition-all shadow-md"
            title="Open Phone's Native Camera"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">System</span>
          </button>
        </div>
      </div>

      {/* Main Viewfinder */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-slate-950">
        {errorMsg ? (
          <div className="p-6 text-center text-slate-300 max-w-sm space-y-4">
            <p className="text-sm font-medium text-red-400">{errorMsg}</p>
            <button
              onClick={() => fallbackInputRef.current?.click()}
              className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 mx-auto active:scale-95 transition-all shadow-lg shadow-sky-500/20"
            >
              <Smartphone className="w-4 h-4" />
              <span>Take Photo with Phone Camera</span>
            </button>
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

            {/* Dynamic Reticle Overlay: Standard 12:8 (1.5:1) or Rotated 8:12 (1:1.5) */}
            <div
              className={`relative pointer-events-none rounded-2xl border-2 border-dashed shadow-2xl flex flex-col justify-between p-3.5 backdrop-blur-[1px] transition-all duration-200 ${
                isRotated
                  ? 'border-amber-400/90 bg-amber-950/10 w-[68%] max-w-sm aspect-[1/1.5] max-h-[72vh]'
                  : 'border-sky-400/80 bg-slate-950/20 w-[90%] max-w-2xl aspect-[1.5/1] max-h-[70vh]'
              }`}
            >
              {/* Top Row Label & Guidance */}
              <div className="flex justify-between items-center">
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-1 bg-slate-950/90 rounded-md border ${
                    isRotated
                      ? 'text-amber-300 border-amber-500/40'
                      : 'text-sky-300 border-sky-500/30'
                  }`}
                >
                  {isRotated ? 'COL 1–8 (TOP) • 12 ROWS' : 'ROW A (TOP) • 12 COLS'}
                </span>
                <span className="text-[9px] font-mono text-slate-300 px-2 py-0.5 bg-black/60 rounded">
                  96-WELL
                </span>
              </div>

              {/* Center Alignment Crosshair */}
              <div className="self-center flex flex-col items-center gap-1 opacity-75">
                <div className={`w-6 h-0.5 ${isRotated ? 'bg-amber-400/70' : 'bg-sky-400/60'}`} />
                <div className={`h-6 w-0.5 ${isRotated ? 'bg-amber-400/70' : 'bg-sky-400/60'} -mt-3.5`} />
                <span className="text-[10px] font-sans font-medium text-white/90 bg-black/70 px-2 py-0.5 rounded mt-1 shadow-sm">
                  {isRotated ? 'Vertical 8×12 mode' : 'Hold flat over plate'}
                </span>
              </div>

              {/* Bottom Row Label */}
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-mono text-slate-400 px-1.5 py-0.5 bg-black/60 rounded">
                  {isRotated ? 'ROW 12' : 'COL 1–12'}
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-1 bg-slate-950/90 rounded-md border self-end ${
                    isRotated
                      ? 'text-amber-300 border-amber-500/40'
                      : 'text-sky-300 border-sky-500/30'
                  }`}
                >
                  {isRotated ? 'COL 1–8 (BOTTOM)' : 'ROW H (BOTTOM)'}
                </span>
              </div>

              {/* Corner brackets */}
              <div
                className={`absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 rounded-tl-lg ${
                  isRotated ? 'border-amber-400' : 'border-emerald-400'
                }`}
              />
              <div
                className={`absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 rounded-tr-lg ${
                  isRotated ? 'border-amber-400' : 'border-emerald-400'
                }`}
              />
              <div
                className={`absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 rounded-bl-lg ${
                  isRotated ? 'border-amber-400' : 'border-emerald-400'
                }`}
              />
              <div
                className={`absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 rounded-br-lg ${
                  isRotated ? 'border-amber-400' : 'border-emerald-400'
                }`}
              />
            </div>
          </>
        )}
      </div>

      {/* Bottom Shutter Action Bar */}
      <div
        style={{ paddingBottom: 'var(--safe-bottom, 16px)' }}
        className="h-28 bg-slate-950/95 backdrop-blur-md flex items-center justify-between px-6 z-30 border-t border-slate-800"
      >
        <button
          onClick={() => fallbackInputRef.current?.click()}
          className="flex flex-col items-center gap-1 text-[11px] text-slate-400 hover:text-white p-2"
          title="Open Native System Camera"
        >
          <Smartphone className="w-5 h-5 text-sky-400" />
          <span>System Cam</span>
        </button>

        {/* Big Round Shutter Button */}
        <button
          onClick={handleSnap}
          disabled={!!errorMsg}
          className="w-20 h-20 rounded-full border-4 border-white bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-all active:scale-90 shadow-2xl shadow-emerald-500/20"
          title="Capture Image"
        >
          <Camera className="w-9 h-9 text-emerald-400" />
        </button>

        <div className="text-right text-[11px] text-slate-400">
          <span className="font-bold text-white block">Capture</span>
          <span className={isRotated ? 'text-amber-400 font-mono text-[10px]' : 'text-slate-500'}>
            {isRotated ? '8×12 Auto-Norm' : 'Landscape 12×8'}
          </span>
        </div>
      </div>
    </div>
  );
};

