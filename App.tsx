
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Frame, AppStatus, ChromaKeyConfig } from './types';

const DEFAULT_BACKGROUNDS = [
  { id: 'none', label: 'None', url: '' },
  { id: 'space', label: 'Deep Space', url: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1280&q=80' },
  { id: 'forest', label: 'Mystic Forest', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1280&q=80' },
  { id: 'city', label: 'Cyber City', url: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1280&q=80' },
  { id: 'sunset', label: 'Desert Sunset', url: 'https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?auto=format&fit=crop&w=1280&q=80' }
];

const rgbToHex = (r: number, g: number, b: number) => {
  return "#" + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
};

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 255, b: 0 };
};

const App: React.FC = () => {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [fps, setFps] = useState(12);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [onionSkin, setOnionSkin] = useState(true);
  const [onionSkinOpacity, setOnionSkinOpacity] = useState(0.4);
  const [isExporting, setIsExporting] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isDropperActive, setIsDropperActive] = useState(false);
  
  const [cameraCapabilities, setCameraCapabilities] = useState<MediaTrackCapabilities | null>(null);
  const [focusMode, setFocusMode] = useState<'continuous' | 'manual'>('continuous');
  const [focusDistance, setFocusDistance] = useState<number>(0);
  const [exposureCompensation, setExposureCompensation] = useState<number>(0);
  const [showCameraPanel, setShowCameraPanel] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number, y: number, displayX: number, displayY: number } | null>(null);

  const [customBackgrounds, setCustomBackgrounds] = useState<{ id: string, label: string, url: string }[]>([]);
  const [chromaConfig, setChromaConfig] = useState<ChromaKeyConfig>({
    color: { r: 0, g: 255, b: 0 },
    hex: '#00ff00',
    tolerance: 100,
    backgroundUrl: DEFAULT_BACKGROUNDS[1].url
  });
  const [showChromaPanel, setShowChromaPanel] = useState(false);

  // Dragging states
  const [mainPanelPos, setMainPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [cameraPanelPos, setCameraPanelPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 });
  const [chromaPanelPos, setChromaPanelPos] = useState<{ x: number; y: number }>({ x: 0, y: 16 });

  const activeDragTarget = useRef<'main' | 'camera' | 'chroma' | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const cameraPanelRef = useRef<HTMLDivElement>(null);
  const chromaPanelRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const processCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const playbackIntervalRef = useRef<number | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const backgroundImgRef = useRef<HTMLImageElement>(new Image());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorPickerRef = useRef<HTMLInputElement>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  
  const backgrounds = [...DEFAULT_BACKGROUNDS, ...customBackgrounds];

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const track = stream.getVideoTracks()[0];
          videoTrackRef.current = track;
          if (track.getCapabilities) {
            const capabilities = track.getCapabilities();
            setCameraCapabilities(capabilities);
            if ((capabilities as any).focusDistance) setFocusDistance((capabilities as any).focusDistance.min || 0);
          }
        }
      } catch (err) { console.error("Error accessing camera:", err); }
    };
    startCamera();

    const initPos = () => {
      if (mainRef.current) {
        const mRect = mainRef.current.getBoundingClientRect();
        setChromaPanelPos({ x: mRect.width - 300, y: 16 });
        setMainPanelPos(null);
      }
    };
    initPos();
    window.addEventListener('resize', initPos);
    window.addEventListener('orientationchange', initPos);

    return () => {
      if (videoTrackRef.current) videoTrackRef.current.stop();
      window.removeEventListener('resize', initPos);
      window.removeEventListener('orientationchange', initPos);
    };
  }, []);

  const startDragging = (e: React.MouseEvent | React.TouchEvent, target: 'main' | 'camera' | 'chroma') => {
    const eventTarget = e.target as HTMLElement;
    if (eventTarget.closest('button') || eventTarget.closest('input')) return;
    
    activeDragTarget.current = target;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    let currentPos = { x: 0, y: 0 };
    if (target === 'main') {
      if (mainPanelPos) {
        currentPos = mainPanelPos;
      } else if (panelRef.current) {
        const rect = panelRef.current.getBoundingClientRect();
        currentPos = { x: rect.left, y: rect.top };
      }
    }
    if (target === 'camera') currentPos = cameraPanelPos;
    if (target === 'chroma') currentPos = chromaPanelPos;
    
    dragOffset.current = { x: clientX - currentPos.x, y: clientY - currentPos.y };
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!activeDragTarget.current || !mainRef.current) return;
      
      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      const mRect = mainRef.current.getBoundingClientRect();
      
      let newX = clientX - dragOffset.current.x;
      let newY = clientY - dragOffset.current.y;
      
      newX = Math.max(-100, Math.min(newX, mRect.width - 50));
      newY = Math.max(0, Math.min(newY, mRect.height - 50));

      if (activeDragTarget.current === 'main') setMainPanelPos({ x: newX, y: newY });
      if (activeDragTarget.current === 'camera') setCameraPanelPos({ x: newX, y: newY });
      if (activeDragTarget.current === 'chroma') setChromaPanelPos({ x: newX, y: newY });
    };

    const handleEnd = () => {
      activeDragTarget.current = null;
      document.body.style.userSelect = 'auto';
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [mainPanelPos, cameraPanelPos, chromaPanelPos]);

  useEffect(() => {
    const applyConstraints = async () => {
      if (!videoTrackRef.current) return;
      const constraints: any = {};
      if ((cameraCapabilities as any)?.focusMode?.includes(focusMode)) constraints.focusMode = focusMode;
      if (focusMode === 'manual' && (cameraCapabilities as any)?.focusDistance) constraints.focusDistance = focusDistance;
      if ((cameraCapabilities as any)?.exposureCompensation) constraints.exposureCompensation = exposureCompensation;
      if (focusPoint && (cameraCapabilities as any)?.focusMode?.includes('continuous')) constraints.pointsOfInterest = [{ x: focusPoint.x, y: focusPoint.y }];
      try { await videoTrackRef.current.applyConstraints({ advanced: [constraints] } as any); } catch (e) { console.warn("Failed to apply camera constraints:", e); }
    };
    applyConstraints();
  }, [focusMode, focusDistance, exposureCompensation, cameraCapabilities, focusPoint]);

  const handlePreviewClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (status === AppStatus.PLAYBACK || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const xPercent = (e.clientX - rect.left) / rect.width;
    const yPercent = (e.clientY - rect.top) / rect.height;

    if (isDropperActive) {
      if (!videoRef.current) return;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = videoRef.current.videoWidth;
      tempCanvas.height = videoRef.current.videoHeight;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(videoRef.current, 0, 0);
        const x = xPercent * tempCanvas.width;
        const y = yPercent * tempCanvas.height;
        const pixel = tempCtx.getImageData(x, y, 1, 1).data;
        setChromaConfig(prev => ({
          ...prev,
          color: { r: pixel[0], g: pixel[1], b: pixel[2] },
          hex: rgbToHex(pixel[0], pixel[1], pixel[2])
        }));
      }
      setIsDropperActive(false);
      return;
    }

    setFocusPoint({ x: xPercent, y: yPercent, displayX: e.clientX - rect.left, displayY: e.clientY - rect.top });
    setTimeout(() => setFocusPoint(null), 1500);
  };

  useEffect(() => {
    if (chromaConfig.backgroundUrl) {
      backgroundImgRef.current.src = chromaConfig.backgroundUrl;
      backgroundImgRef.current.crossOrigin = "anonymous";
    }
  }, [chromaConfig.backgroundUrl]);

  useEffect(() => {
    let animationFrameId: number;
    const processFrame = () => {
      if (!videoRef.current || !previewCanvasRef.current || !processCanvasRef.current) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }
      if (status === AppStatus.PLAYBACK) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }
      const video = videoRef.current;
      const pCtx = processCanvasRef.current.getContext('2d', { willReadFrequently: true });
      const ctx = previewCanvasRef.current.getContext('2d');
      if (pCtx && ctx && video.readyState >= 2) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (processCanvasRef.current.width !== w) {
          processCanvasRef.current.width = w; processCanvasRef.current.height = h;
          previewCanvasRef.current.width = w; previewCanvasRef.current.height = h;
        }

        const brightnessValue = Math.pow(2, exposureCompensation);
        const exposureFilter = `brightness(${brightnessValue * 100}%) contrast(${100 + Math.abs(exposureCompensation) * 10}%)`;

        if (chromaConfig.backgroundUrl !== '') {
          pCtx.filter = exposureFilter;
          pCtx.drawImage(video, 0, 0, w, h);
          pCtx.filter = 'none';
          const imageData = pCtx.getImageData(0, 0, w, h);
          const data = imageData.data;
          const { r: tr, g: tg, b: tb } = chromaConfig.color;
          const tol = chromaConfig.tolerance;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            if (Math.sqrt((r-tr)**2 + (g-tg)**2 + (b-tb)**2) < tol) data[i+3] = 0;
          }
          pCtx.putImageData(imageData, 0, 0);
          ctx.clearRect(0, 0, w, h);
          if (chromaConfig.backgroundUrl && backgroundImgRef.current.complete) ctx.drawImage(backgroundImgRef.current, 0, 0, w, h);
          else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); }
          ctx.drawImage(processCanvasRef.current, 0, 0, w, h);
        } else {
          ctx.filter = exposureFilter;
          ctx.drawImage(video, 0, 0, w, h);
          ctx.filter = 'none';
        }
      }
      animationFrameId = requestAnimationFrame(processFrame);
    };
    processFrame();
    return () => cancelAnimationFrame(animationFrameId);
  }, [chromaConfig, status, exposureCompensation]);

  const playCaptureSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note

      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.warn("Audio feedback failed:", e);
    }
  };

  const captureFrame = useCallback(() => {
    if (status === AppStatus.PLAYBACK) setStatus(AppStatus.IDLE);
    setIsFlashing(true);
    playCaptureSound();
    setTimeout(() => setIsFlashing(false), 100);
    if (!previewCanvasRef.current) return;
    const dataUrl = previewCanvasRef.current.toDataURL('image/jpeg', 0.9);
    const newFrame: Frame = { id: crypto.randomUUID(), dataUrl, timestamp: Date.now() };
    setFrames(prev => [...prev, newFrame]);
    setPlaybackIndex(frames.length);
  }, [status, frames.length]);

  useEffect(() => {
    if (status === AppStatus.PLAYBACK && frames.length > 0) {
      playbackIntervalRef.current = window.setInterval(() => {
        setPlaybackIndex(prev => (prev + 1) % frames.length);
      }, 1000 / fps);
    } else if (playbackIntervalRef.current) { clearInterval(playbackIntervalRef.current); }
    return () => { if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current); };
  }, [status, frames.length, fps]);

  const handleExport = async () => {
    if (frames.length === 0) return;
    setIsExporting(true);
    setStatus(AppStatus.IDLE);
    try {
      const exportCanvas = document.createElement('canvas');
      const tempImg = new Image();
      tempImg.src = frames[0].dataUrl;
      await new Promise((resolve) => tempImg.onload = resolve);
      exportCanvas.width = tempImg.width; exportCanvas.height = tempImg.height;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) throw new Error("Context error");
      const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
      let selectedType = 'video/webm';
      for (const t of types) { if (MediaRecorder.isTypeSupported(t)) { selectedType = t; break; } }
      const extension = selectedType.includes('mp4') ? 'mp4' : 'webm';
      const recorder = new MediaRecorder(exportCanvas.captureStream(fps), { mimeType: selectedType, videoBitsPerSecond: 8000000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: selectedType });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `stopmo-${Date.now()}.${extension}`; a.click();
        setIsExporting(false);
      };
      recorder.start();
      for (let i = 0; i < frames.length; i++) {
        setPlaybackIndex(i);
        const frameImg = new Image(); frameImg.src = frames[i].dataUrl;
        await new Promise((resolve) => frameImg.onload = resolve);
        ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
        ctx.drawImage(frameImg, 0, 0);
        await new Promise(resolve => setTimeout(resolve, 1000 / fps));
      }
      recorder.stop();
    } catch (err) { console.error(err); setIsExporting(false); }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        setCustomBackgrounds(prev => [...prev, { id: `c-${Date.now()}`, label: 'Custom', url }]);
        setChromaConfig(prev => ({ ...prev, backgroundUrl: url }));
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleCameraPanel = () => {
    setShowCameraPanel(!showCameraPanel);
  };

  const toggleChromaPanel = () => {
    setShowChromaPanel(!showChromaPanel);
  };

  const togglePlayback = () => {
    setStatus(status === AppStatus.PLAYBACK ? AppStatus.IDLE : AppStatus.PLAYBACK);
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    const rgb = hexToRgb(hex);
    setChromaConfig(prev => ({
      ...prev,
      hex,
      color: rgb
    }));
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      <video ref={videoRef} autoPlay playsInline className="hidden" />
      <canvas ref={processCanvasRef} className="hidden" />

      <header className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex justify-end items-center z-10 shrink-0">
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExport} 
            disabled={isExporting || frames.length === 0} 
            className={`px-6 py-1.5 rounded-full text-[10px] font-bold transition-all flex items-center gap-2 border ${isExporting ? 'bg-slate-700 opacity-50' : 'bg-red-600 hover:bg-red-500 border-red-400/30 shadow-lg shadow-red-600/20'}`}
          >
            {isExporting ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
            {isExporting ? 'EXPORTING...' : 'EXPORT'}
          </button>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        {/* Playback Overlay */}
        {(status === AppStatus.PLAYBACK || isExporting) && (
          <div className="w-full h-full flex items-center justify-center relative bg-black z-20">
            {frames.length > 0 && <img src={frames[playbackIndex].dataUrl} className="max-w-full max-h-full object-contain" alt="Playback" />}
            <div className="absolute top-4 left-4 bg-black/70 px-3 py-1 rounded-full text-[10px] font-mono border border-white/10 backdrop-blur-md">
              {isExporting ? 'RECORDING: ' : 'PLAYING: '} {playbackIndex + 1} / {frames.length}
            </div>
            <button onClick={() => setStatus(AppStatus.IDLE)} className="absolute top-4 right-4 bg-red-600/80 hover:bg-red-600 text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm transition-all shadow-lg">Back to Camera</button>
          </div>
        )}

        {/* Camera Preview */}
        <div className={`relative w-full h-full flex items-center justify-center bg-slate-900 overflow-hidden ${status === AppStatus.PLAYBACK || isExporting ? 'hidden' : 'block'}`}>
          <canvas ref={previewCanvasRef} onClick={handlePreviewClick} className={`max-w-full max-h-full object-contain ${isDropperActive ? 'cursor-copy' : 'cursor-crosshair'}`} />
          <div className={`absolute inset-0 bg-white transition-opacity duration-75 pointer-events-none ${isFlashing ? 'opacity-100' : 'opacity-0'}`} />
          {onionSkin && frames.length > 0 && <img src={frames[frames.length-1].dataUrl} className="absolute inset-0 w-full h-full object-contain pointer-events-none" style={{ mixBlendMode: 'screen', opacity: onionSkinOpacity }} />}
          {focusPoint && <div className="absolute w-12 h-12 border-2 border-yellow-400 rounded-full animate-ping pointer-events-none" style={{ left: focusPoint.displayX, top: focusPoint.displayY, transform: 'translate(-50%, -50%)' }} />}
          <div className="absolute top-4 left-4 bg-red-600/80 px-2 py-0.5 rounded text-[8px] font-bold tracking-widest uppercase animate-pulse">LIVE</div>
          {isDropperActive && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-emerald-600 px-4 py-1.5 rounded-full text-[10px] font-bold shadow-xl border border-emerald-400/30 animate-bounce">
              Click on preview to pick key color
            </div>
          )}
        </div>

        {/* Camera Settings Panel */}
        {showCameraPanel && (
          <div 
            ref={cameraPanelRef}
            onMouseDown={(e) => startDragging(e, 'camera')} onTouchStart={(e) => startDragging(e, 'camera')}
            style={{ left: `${cameraPanelPos.x}px`, top: `${cameraPanelPos.y}px`, cursor: activeDragTarget.current === 'camera' ? 'grabbing' : 'grab' }}
            className="absolute w-72 bg-slate-950/40 backdrop-blur-2xl border border-white/10 p-4 rounded-2xl shadow-2xl z-40 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Camera Settings</h3>
              <button onClick={() => setShowCameraPanel(false)} className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-300 font-bold uppercase">Focus</span>
                <div className="flex bg-white/5 rounded-lg p-0.5">
                  <button onClick={() => setFocusMode('continuous')} className={`px-2 py-0.5 text-[9px] rounded transition-all ${focusMode === 'continuous' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>AUTO</button>
                  <button onClick={() => setFocusMode('manual')} className={`px-2 py-0.5 text-[9px] rounded transition-all ${focusMode === 'manual' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>MANUAL</button>
                </div>
              </div>
              {focusMode === 'manual' && (cameraCapabilities as any)?.focusDistance && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-slate-500 font-bold"><span>DISTANCE</span><span>{focusDistance.toFixed(2)}</span></div>
                  <input type="range" min={(cameraCapabilities as any).focusDistance.min} max={(cameraCapabilities as any).focusDistance.max} step={0.01} value={focusDistance} onChange={(e) => setFocusDistance(parseFloat(e.target.value))} className="w-full accent-blue-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer" />
                </div>
              )}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-slate-500 font-bold"><span>EXPOSURE</span><span>{exposureCompensation > 0 ? '+' : ''}{exposureCompensation.toFixed(1)}</span></div>
                <input type="range" min="-2" max="2" step="0.1" value={exposureCompensation} onChange={(e) => setExposureCompensation(parseFloat(e.target.value))} className="w-full accent-red-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer" />
              </div>
            </div>
          </div>
        )}

        {/* Chroma Key Panel */}
        {showChromaPanel && (
          <div 
            ref={chromaPanelRef}
            onMouseDown={(e) => startDragging(e, 'chroma')} onTouchStart={(e) => startDragging(e, 'chroma')}
            style={{ left: `${chromaPanelPos.x}px`, top: `${chromaPanelPos.y}px`, cursor: activeDragTarget.current === 'chroma' ? 'grabbing' : 'grab' }}
            className="absolute w-72 bg-slate-950/40 backdrop-blur-2xl border border-white/10 p-4 rounded-2xl shadow-2xl z-40 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Chroma Key</h3>
              <button onClick={() => setShowChromaPanel(false)} className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-4">
              <div 
                className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors"
                onClick={() => setIsDropperActive(true)}
              >
                <div className="flex items-center gap-3">
                  <div className="relative group">
                    <div className="w-8 h-8 rounded-lg shadow-inner border border-white/10" style={{ backgroundColor: chromaConfig.hex }} />
                    <input 
                      type="color" 
                      ref={colorPickerRef}
                      value={chromaConfig.hex} 
                      onChange={handleColorChange}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] font-bold text-slate-500 uppercase">Key Color</span>
                    <span className="text-[10px] font-mono text-slate-300 uppercase">{chromaConfig.hex}</span>
                  </div>
                </div>
                <div className={`p-2 rounded-lg transition-all ${isDropperActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                   <span className="text-[10px] font-bold uppercase">{isDropperActive ? 'PICKING...' : 'PICK'}</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-slate-500 font-bold"><span>TOLERANCE</span><span>{chromaConfig.tolerance}</span></div>
                <input type="range" min="0" max="255" value={chromaConfig.tolerance} onChange={(e) => setChromaConfig(prev => ({ ...prev, tolerance: parseInt(e.target.value) }))} className="w-full accent-emerald-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center"><label className="text-[9px] text-slate-500 font-bold uppercase">Backgrounds</label><label className="text-[8px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/20 cursor-pointer">IMPORT<input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" /></label></div>
                <div className="grid grid-cols-4 gap-1.5">
                  {backgrounds.map(bg => (
                    <button key={bg.id} onClick={() => setChromaConfig(prev => ({ ...prev, backgroundUrl: bg.url }))} className={`h-8 rounded border transition-all ${chromaConfig.backgroundUrl === bg.url ? 'border-emerald-500' : 'border-white/10 hover:border-white/20'}`}>
                      {bg.url ? <img src={bg.url} className="w-full h-full object-cover rounded-[1px]" /> : <div className="w-full h-full bg-black/40 flex items-center justify-center text-[7px]">OFF</div>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Floating Side Tools */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-30">
          <button onClick={toggleCameraPanel} className={`p-3 rounded-full border transition-all backdrop-blur-xl ${showCameraPanel ? 'bg-blue-600/40 border-blue-400/50' : 'bg-white/5 border-white/10'}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="10" />
              <path d="M14.31 8l5.74 9.94" />
              <path d="M9.69 8h11.48" />
              <path d="M7.38 12l5.74-9.94" />
              <path d="M9.69 16L3.95 6.06" />
              <path d="M14.31 16H2.83" />
              <path d="M16.62 12l-5.74 9.94" />
            </svg>
          </button>
          <button onClick={toggleChromaPanel} className={`p-3 rounded-full border transition-all backdrop-blur-xl ${chromaConfig.backgroundUrl !== '' ? 'bg-emerald-600/40 border-emerald-400/50' : 'bg-white/5 border-white/10'}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </button>
        </div>

        {/* Main Control Panel */}
        <div 
          ref={panelRef}
          onMouseDown={(e) => startDragging(e, 'main')} onTouchStart={(e) => startDragging(e, 'main')}
          style={mainPanelPos ? { 
            left: `${mainPanelPos.x}px`, 
            top: `${mainPanelPos.y}px`, 
            cursor: activeDragTarget.current === 'main' ? 'grabbing' : 'grab' 
          } : {
            left: '50%',
            bottom: '24px',
            transform: 'translateX(-50%)',
            cursor: activeDragTarget.current === 'main' ? 'grabbing' : 'grab'
          }}
          className={`absolute flex items-center gap-6 bg-slate-900/60 backdrop-blur-[32px] px-8 py-4 rounded-[2.5rem] border border-white/20 shadow-2xl z-30 transition-shadow`}
        >
          <button onClick={togglePlayback} className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center active:scale-90 hover:bg-white transition-all shadow-lg border-4 border-white/10">
            {status === AppStatus.PLAYBACK ? (
              <svg className="w-10 h-10 text-red-600" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="4" height="12" rx="1.5" /><rect x="14" y="6" width="4" height="12" rx="1.5" /></svg>
            ) : (
              <div className="w-11 h-11 flex items-center justify-center">
                <svg className="w-9 h-9 text-red-600 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.56 10.27L8.78 3.51a2.07 2.07 0 00-3.15 1.73v13.52c0 1.63 1.79 2.62 3.15 1.73l10.78-6.76a2.07 2.07 0 000-3.46z" /></svg>
              </div>
            )}
          </button>
          
          <button onClick={captureFrame} className="w-14 h-14 bg-white rounded-full flex items-center justify-center active:scale-95 transition-all shadow-xl group border-4 border-white/20">
            <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center group-active:scale-90 transition-transform overflow-hidden">
              <div className="w-4 h-4 bg-white rounded-full" />
            </div>
          </button>

          <div className="flex flex-col gap-2 min-w-[120px]">
            <div className="flex flex-col">
              <div className="flex justify-between items-center mb-0.5"><span className="text-[8px] font-bold text-white/40 uppercase">FPS</span><span className="text-[9px] font-mono text-red-400 font-bold">{fps}</span></div>
              <input type="range" min="1" max="24" value={fps} onChange={(e) => setFps(parseInt(e.target.value))} className="w-full accent-red-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer" />
            </div>
            <div className="flex flex-col">
              <div className="flex justify-between items-center mb-0.5">
                <button onClick={() => setOnionSkin(!onionSkin)} className={`text-[8px] font-bold uppercase ${onionSkin ? 'text-red-400' : 'text-white/40'}`}>ONION</button>
                <span className="text-[9px] font-mono text-white/20">{(onionSkinOpacity * 100).toFixed(0)}%</span>
              </div>
              <input type="range" min="0" max="1" step="0.01" value={onionSkinOpacity} onChange={(e) => setOnionSkinOpacity(parseFloat(e.target.value))} disabled={!onionSkin} className="w-full accent-red-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer" />
            </div>
          </div>
        </div>
      </main>

      <footer className="h-40 bg-slate-900 border-t border-slate-800 flex flex-col">
        <div className="px-4 py-2 flex justify-between items-center bg-slate-950/40 shrink-0">
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{frames.length} FRAMES</span>
          <button onClick={() => confirm("Clear all frames?") && setFrames([])} className="text-[8px] text-red-500 hover:text-red-400 font-bold uppercase transition-colors">Clear</button>
        </div>
        <div className="px-4 py-1 shrink-0"><input type="range" min="0" max={Math.max(0, frames.length - 1)} value={playbackIndex} onChange={(e) => setPlaybackIndex(parseInt(e.target.value))} className="w-full accent-red-500 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer" /></div>
        <div ref={timelineScrollRef} className="flex-1 overflow-x-auto hide-scrollbar flex items-center gap-2 px-4 py-2">
          {frames.map((frame, idx) => (
            <div key={frame.id} onClick={() => setPlaybackIndex(idx)} className={`relative shrink-0 w-24 aspect-video rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${playbackIndex === idx ? 'border-red-500 scale-105 shadow-xl' : 'border-slate-800 opacity-60'}`}>
              <img src={frame.dataUrl} className="w-full h-full object-cover" />
              <div className="absolute bottom-1 right-1 bg-black/70 px-1 text-[8px] font-mono rounded-tl border-l border-t border-white/5">{idx + 1}</div>
            </div>
          ))}
          {frames.length === 0 && <div className="w-full h-full flex items-center justify-center text-slate-700 text-[10px] font-bold uppercase tracking-[0.2em]">Capture frames to begin</div>}
        </div>
      </footer>
    </div>
  );
};

export default App;
