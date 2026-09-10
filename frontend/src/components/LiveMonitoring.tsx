import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  Camera, 
  CameraOff, 
  AlertTriangle, 
  Activity, 
  Volume2, 
  VolumeX, 
  RefreshCw,
  Clock,
  Calendar,
  CheckCircle,
  CheckCircle2,
  XCircle,
  RotateCcw
} from 'lucide-react';
import { apiService } from '../services/api';
import type { User } from '../services/api';
import { uploadImageToSupabase, uploadDetectionSnapshotToSupabase, isSupabaseConfigured, supabase } from '../services/supabase';
import { serialService, type ArduinoConnectionState } from '../services/serialService';
import { areModelsLoaded, loadFaceModels } from '../services/modelLoader';


const faceapi = (window as any).faceapi;

interface LiveMonitoringProps {
  registeredUsers: User[];
  cameraActive: boolean;
  setCameraActive: (val: boolean) => void;
  arduinoConnected: boolean;
  arduinoConnectionState?: ArduinoConnectionState;
  arduinoStatusText: string;
  triggerNotification: (message: string) => void;
  addLogEntry: (
    name: string,
    status: string,
    confidence: number,
    photoUrl?: string,
    userId?: string,
    spoofDetected?: boolean,
    multiplePersons?: boolean,
    spoofReason?: string,
    livenessScore?: number,
    authMethod?: string,
    identityMatch?: boolean,
    metadata?: Record<string, any>
  ) => void;
  setAlertActive?: (active: boolean) => void;
}

export const LiveMonitoring: React.FC<LiveMonitoringProps> = ({
  registeredUsers,
  cameraActive,
  setCameraActive,
  arduinoConnected,
  arduinoConnectionState,
  arduinoStatusText,
  triggerNotification,
  addLogEntry,
  setAlertActive
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastUserLogTime = useRef<{ [key: string]: number }>({});
  const lastSerialSignalRef = useRef<{ signal: string; time: number }>({ signal: '', time: 0 });
  
  const [monitoring, setMonitoring] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const [alarmActive, setAlarmActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [fps, setFps] = useState(60);
  const [modelsLoaded, setModelsLoaded] = useState(() => areModelsLoaded());
  const [modelsLoadingError, setModelsLoadingError] = useState(false);
  const [time, setTime] = useState(new Date());

  // Biometric Database States
  const [faceImages, setFaceImages] = useState<any[]>([]);
  const [biometricsLoaded, setBiometricsLoaded] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.50);
  const trackedFacesRef = useRef<any[]>([]);
  const isProcessingEnrollmentRef = useRef(false);

  // Smart Access states
  const [multipleAuthorizedInFrame, setMultipleAuthorizedInFrame] = useState(false);
  const [multiplePersonsWarning, setMultiplePersonsWarning] = useState(false);

  // Fast lightweight snapshot generator for logs & alerts
  const captureFastSnapshot = (videoEl: HTMLVideoElement): string => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 360;
      canvas.height = 202;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0, 360, 202);
        return canvas.toDataURL('image/jpeg', 0.45);
      }
    } catch (e) {
      console.warn("[VisionGuard AI] Snapshot capture failed:", e);
    }
    return '';
  };

  // Alarm sound generator
  const playAlarmBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);

      oscillator.start();
      oscillator.frequency.linearRampToValueAtTime(440, audioCtx.currentTime + 0.3);
      oscillator.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.6);
      oscillator.stop(audioCtx.currentTime + 0.65);
    } catch (e) {
      console.log("AudioContext blocked:", e);
    }
  };

  // Load configurable confidence threshold and security mode from settings on mount
  useEffect(() => {
    apiService.getSettings()
      .then(settings => {
        const pct = settings.confidenceThreshold || 85;
        const clampedPct = Math.max(50, Math.min(100, pct));
        // Map percentage to Euclidean distance threshold
        // 50% accuracy => 0.60 distance (lenient)
        // 85% accuracy => 0.42 distance (strict)
        // 100% accuracy => 0.35 distance (very strict)
        const distThreshold = 0.60 - ((clampedPct - 50) / 50) * 0.25;
        setConfidenceThreshold(Math.max(0.35, Math.min(0.60, distThreshold)));
        console.log(`[VisionGuard AI] Configured recognition threshold: ${pct}% => distance ${distThreshold.toFixed(3)}`);
      })
      .catch((err) => {
        console.warn("[VisionGuard AI] Could not fetch settings, using defaults:", err);
        setConfidenceThreshold(0.50); // Default: strict threshold
      });
  }, []);

  // Live recognition result state - shows last detected face result
  const [lastRecognition, setLastRecognition] = useState<{
    name: string;
    status: 'Authorized' | 'Unknown' | 'Unregistered Visitor' | 'Security Alert' | 'Unauthorized' | 'Verifying';
    confidence: number;
    timestamp: string;
    faceDetected?: boolean;
  } | null>(null);

  // Popup Modal Registration States
  const [showRegisterPopup, setShowRegisterPopup] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [regStep, setRegStep] = useState(1); // 1 = Ask user, 2 = Form input, 3 = Auto-capture, 4 = Success
  
  // Registration Form States
  const [regName, setRegName] = useState('');
  const [regId, setRegId] = useState('');
  const [regGender, setRegGender] = useState('Male');
  const [regAge, setRegAge] = useState<number | ''>('');
  const [regDesignation, setRegDesignation] = useState('Staff Officer');
  const [regDepartment, setRegDepartment] = useState('');
  const [enrollProgress, setEnrollProgress] = useState(0);
  const [capturedCount, setCapturedCount] = useState(0);
  const [capturedImagesList, setCapturedImagesList] = useState<string[]>([]);

  // Cooldowns and enrollment control refs
  const popupCooldown = useRef<boolean>(false);
  const isEnrolling = useRef<boolean>(false);

  // Load biometric database (face_images) at startup
  useEffect(() => {
    const loadBiometricDB = async () => {
      if (!isSupabaseConfigured || !supabase) {
        console.warn("[VisionGuard AI] Supabase not configured. Using fallback average embeddings.");
        setBiometricsLoaded(true);
        return;
      }
      try {
        console.log("[VisionGuard AI] Loading face image signatures database from Supabase...");
        const { data, error } = await supabase
          .from('face_images')
          .select('*');
        if (error) throw error;
        
        console.log(`[VisionGuard AI] Loaded ${data?.length || 0} stored face images and embeddings.`);
        setFaceImages(data || []);
        setBiometricsLoaded(true);
      } catch (err) {
        console.error("[VisionGuard AI] Error loading face images database:", err);
        setBiometricsLoaded(true); // Fallback to average embeddings
      }
    };
    loadBiometricDB();
  }, [registeredUsers]);

  // Memoize and pre-parse face embeddings to avoid JSON.parse in the 30 FPS drawing loop
  const parsedUsers = useMemo(() => {
    const parsed = registeredUsers.map(user => {
      // Find all embeddings for this user in the faceImages table
      const userImages = faceImages.filter(img => img.user_id === user.id);
      const parsedEmbeddings: Float32Array[] = [];
      userImages.forEach(img => {
        try {
          const arr = typeof img.embedding === 'string' ? JSON.parse(img.embedding) : img.embedding;
          if (Array.isArray(arr)) {
            parsedEmbeddings.push(new Float32Array(arr));
          }
        } catch (e) {
          console.error(`[VisionGuard AI] Failed to parse embedding for image ${img.id}:`, e);
        }
      });

      // Fallback: If no multi-embeddings are loaded for this user, use the legacy user.faceEmbedding
      if (parsedEmbeddings.length === 0 && user.faceEmbedding) {
        try {
          let embeddingArray = user.faceEmbedding;
          if (typeof embeddingArray === 'string') {
            embeddingArray = JSON.parse(embeddingArray);
          }
          if (Array.isArray(embeddingArray)) {
            parsedEmbeddings.push(new Float32Array(embeddingArray));
          }
        } catch (e) {
          console.error(`[VisionGuard AI] Legacy fallback parse failed for ${user.name}:`, e);
        }
      }

      console.log(`[VisionGuard AI] Loaded ${parsedEmbeddings.length} signature(s) for user: ${user.name}`);
      return {
        ...user,
        parsedEmbeddings
      };
    });
    console.log(`[VisionGuard AI] Recognition Database created: ${parsed.length} profiles compiled.`);
    return parsed;
  }, [registeredUsers, faceImages]);

  // Stable ref so the detection loop can read latest parsedUsers without being in its dependency array
  const parsedUsersRef = useRef(parsedUsers);
  useEffect(() => { 
    parsedUsersRef.current = parsedUsers; 

    // Clean up face recognition active cache: Remove any tracked face whose stableUserId is no longer registered
    if (trackedFacesRef.current && trackedFacesRef.current.length > 0) {
      trackedFacesRef.current = trackedFacesRef.current.filter(t => {
        if (!t.stableUserId) return true;
        // Keep tracker only if stableUserId is still present in the updated registeredUsers list
        return registeredUsers.some(u => u.id === t.stableUserId);
      });
      console.log('[VisionGuard Cache] Active face recognition tracker cache synchronized.');
    }
  }, [parsedUsers, registeredUsers]);

  // Clock Update
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fast parallel neural model loading using global cache singleton
  useEffect(() => {
    if (areModelsLoaded()) {
      setModelsLoaded(true);
      return;
    }

    loadFaceModels()
      .then(success => {
        if (success) {
          setModelsLoaded(true);
        } else {
          setModelsLoadingError(true);
        }
      })
      .catch(err => {
        console.error('[VisionGuard AI] Error initializing models:', err);
        setModelsLoadingError(true);
      });
  }, []);

  // Web Camera Stream setup - automatically starts immediately on mount
  const stopCameraStream = () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => track.stop());
      activeStreamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      try {
        const currentStream = videoRef.current.srcObject as MediaStream;
        currentStream.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.warn("[LiveMonitoring] Error stopping video srcObject tracks:", e);
      }
      videoRef.current.srcObject = null;
    }
  };

  const initCamera = async () => {
    // Stop any existing camera streams to avoid duplicate open stream handles
    stopCameraStream();

    setCameraLoading(true);
    setCameraError(null);

    try {
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, min: 320 },
            height: { ideal: 360, min: 240 },
            facingMode: 'user'
          },
          audio: false
        });
      } catch (constraintErr) {
        console.warn("[LiveMonitoring] Ideal camera constraints unavailable, using default stream:", constraintErr);
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      activeStreamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(e => console.log("Video play deferred:", e));
      }

      setCameraLoading(false);
      setCameraActive(true);
      setMonitoring(true);
      setCameraError(null);
      console.log("[LiveMonitoring] Camera connected and live monitoring active immediately.");
    } catch (err: any) {
      console.error("[LiveMonitoring] Camera access error:", err);
      stopCameraStream();
      setCameraLoading(false);
      setCameraActive(false);
      setMonitoring(false);

      let msg = "Camera could not be accessed.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = "Camera permission was denied. Please allow camera access in your browser settings and try again.";
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = "No camera device found on this system. Please connect a webcam.";
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = "Camera is currently in use by another application or process.";
      } else if (err.message) {
        msg = err.message;
      }
      setCameraError(msg);
      triggerNotification("Camera error: " + msg);
    }
  };

  // Launch camera & detection immediately on mount, and cleanly teardown on unmount
  useEffect(() => {
    // Automatically open camera immediately when user opens Live Monitoring
    initCamera();

    return () => {
      stopCameraStream();
      setCameraActive(false);
      setMonitoring(false);
    };
  }, []);

  // Web Serial functions for Arduino alarm triggers
  const sendSerialSignal = async (signal: string) => {
    const now = Date.now();
    // 500ms threshold for same-signal repeat, immediate for new signals
    if (lastSerialSignalRef.current.signal === signal && now - lastSerialSignalRef.current.time < 500) {
      return;
    }
    lastSerialSignalRef.current = { signal, time: now };
    try {
      if (signal === "1\n" || signal === "1" || signal === "UNAUTHORIZED") {
        await serialService.sendCommand('UNAUTHORIZED');
      } else if (signal === "AUTHORIZED") {
        await serialService.sendCommand('AUTHORIZED');
      } else if (signal === "OFF" || signal === "ALERT_OFF" || signal === "0\n" || signal === "0") {
        await serialService.sendCommand('OFF');
      } else {
        await serialService.sendCommand(signal);
      }
    } catch (err) {
      console.warn('[VisionGuard Serial] Failed to send command to Arduino:', err);
    }
  };

  // Real-time Bounding Box & Recognition Frame Loop
  useEffect(() => {
    let active = true;
    let animationFrameId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    
    let isDetecting = false;
    let lastLogTimeSec = 0;
    let lastDetectionTime = 0;

    const drawLoop = () => {
      if (!active) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (monitoring && cameraActive && !cameraLoading && video && canvas && modelsLoaded && !isEnrolling.current) {
        // Sync canvas size
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          const displaySize = { width: video.videoWidth, height: video.videoHeight };
          if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
            canvas.width = displaySize.width;
            canvas.height = displaySize.height;
            console.log(`[VisionGuard AI] Canvas synced to viewport size: ${displaySize.width}x${displaySize.height}`);
          }

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw bounding boxes for all currently tracked faces
            trackedFacesRef.current.forEach((t) => {
              const box = t.box;
              const isMatch = t.stableIsMatch;
              const isSpoof = t.stableIsSpoof;
              const displayName = t.stableName;
              const displayConf = t.stableConf;
              const isVerifying = t.isVerifying;
              
              // Find designation
              let designation = '';
              if (isMatch && t.stableUserId) {
                const matchedUser = registeredUsers.find(u => u.id === t.stableUserId);
                if (matchedUser) {
                  designation = matchedUser.designation || matchedUser.role || 'Staff Officer';
                }
              }

              // Bounding box overlay styling: Green for Authorized, Orange for Spoof, Amber for Verifying, Red for Unauthorized
              const boxColor = isSpoof 
                ? 'rgba(255, 85, 0, 0.95)' 
                : isVerifying 
                ? 'rgba(230, 160, 10, 0.95)' 
                : isMatch 
                ? 'rgba(0, 255, 136, 0.9)' 
                : '#dc2626';

              const shadowColor = isSpoof 
                ? 'rgba(255, 85, 0, 0.5)' 
                : isVerifying 
                ? 'rgba(230, 160, 10, 0.5)' 
                : isMatch 
                ? 'rgba(0, 255, 136, 0.5)' 
                : 'rgba(220, 38, 38, 0.9)';
              
              ctx.strokeStyle = boxColor;
              ctx.lineWidth = (isMatch || isSpoof || isVerifying) ? 2.5 : 4.0;
              ctx.shadowColor = shadowColor;
              ctx.shadowBlur = (isMatch || isSpoof || isVerifying) ? 12 : 18;
              ctx.strokeRect(box.x, box.y, box.width, box.height);
              ctx.shadowBlur = 0;

              // Corner indicators
              const len = Math.min(22, box.width * 0.22);
              ctx.strokeStyle = isSpoof 
                ? '#ff5500' 
                : isVerifying 
                ? '#f59e0b' 
                : isMatch 
                ? '#00ff88' 
                : '#ff4444';
              ctx.lineWidth = (isMatch || isSpoof || isVerifying) ? 4.0 : 5.5;
              // Top-Left
              ctx.beginPath(); ctx.moveTo(box.x, box.y + len); ctx.lineTo(box.x, box.y); ctx.lineTo(box.x + len, box.y); ctx.stroke();
              // Top-Right
              ctx.beginPath(); ctx.moveTo(box.x + box.width - len, box.y); ctx.lineTo(box.x + box.width, box.y); ctx.lineTo(box.x + box.width, box.y + len); ctx.stroke();
              // Bottom-Left
              ctx.beginPath(); ctx.moveTo(box.x, box.y + box.height - len); ctx.lineTo(box.x, box.y + box.height); ctx.lineTo(box.x + len, box.y + box.height); ctx.stroke();
              // Bottom-Right
              ctx.beginPath(); ctx.moveTo(box.x + box.width - len, box.y + box.height); ctx.lineTo(box.x + box.width, box.y + box.height); ctx.lineTo(box.x + box.width, box.y + box.height - len); ctx.stroke();

              // Text plate
              let labelLine1 = isMatch ? `🟢 AUTHORIZED` : `🔴 UNAUTHORIZED`;
              let labelLine2 = isMatch ? `Name: ${displayName}` : 'Name: Unknown';
              let labelLine3 = isMatch ? `Status: AUTHORIZED` : `Status: UNAUTHORIZED`;
              let labelLine4 = `Confidence: ${displayConf}%`;

              if (isSpoof) {
                labelLine1 = `🔴 UNAUTHORIZED`;
                labelLine2 = `Live Face Verification Failed.`;
                labelLine3 = `Status: UNAUTHORIZED`;
                labelLine4 = `Liveness Score: ${t.stableLivenessScore}%`;
              } else if (isVerifying) {
                labelLine1 = `🟡 VERIFYING...`;
                labelLine2 = `Name: Identifying...`;
                labelLine3 = `Status: VERIFYING`;
                labelLine4 = `Confidence: --`;
              }

              const labelBg = isSpoof 
                ? 'rgba(220, 80, 20, 0.98)' 
                : isVerifying 
                ? 'rgba(200, 140, 10, 0.95)' 
                : isMatch 
                ? 'rgba(0, 180, 90, 0.95)' 
                : 'rgba(200, 30, 30, 0.95)';
              const labelH = 82; 
              const labelW = Math.max(box.width, 195);
              const labelY = box.y > labelH + 4 ? box.y - labelH - 4 : box.y + box.height + 4;

              ctx.fillStyle = labelBg;
              ctx.shadowColor = isSpoof 
                ? 'rgba(255,85,0,0.4)' 
                : isVerifying 
                ? 'rgba(230,160,10,0.4)' 
                : isMatch 
                ? 'rgba(0,255,136,0.4)' 
                : 'rgba(255,50,50,0.4)';
              ctx.shadowBlur = 10;
              ctx.beginPath();
              ctx.roundRect(box.x, labelY, labelW, labelH, 7);
              ctx.fill();
              ctx.shadowBlur = 0;

              // Line 1: Status
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 12px Orbitron, monospace';
              ctx.fillText(labelLine1, box.x + 10, labelY + 18);

              // Line 2: Name / Access Denied
              ctx.font = 'bold 11px Inter, sans-serif';
              ctx.fillStyle = 'rgba(255,255,255,0.95)';
              ctx.fillText(labelLine2, box.x + 10, labelY + 35);

              // Line 3: Status
              ctx.font = '11px Inter, sans-serif';
              ctx.fillStyle = 'rgba(255,255,255,0.85)';
              ctx.fillText(labelLine3, box.x + 10, labelY + 52);

              // Line 4: Confidence
              ctx.font = '11px Inter, sans-serif';
              ctx.fillStyle = 'rgba(255,255,255,0.85)';
              ctx.fillText(labelLine4, box.x + 10, labelY + 69);
            });
          }

          // Throttle heavy AI detection/recognition to run every ~80ms (~12 FPS) — fast detection with smooth 60 FPS canvas
          const nowMs = Date.now();
          if (nowMs - lastDetectionTime >= 80) {
            if (!isDetecting) {
              isDetecting = true;
              lastDetectionTime = nowMs;
              runFaceDetection(video, displaySize).then(() => {
                isDetecting = false;
              }).catch(err => {
                console.error("[VisionGuard AI] Async detection error:", err);
                isDetecting = false;
              });
            }
          }
        }
      }

      // Calculate actual draw FPS
      const now = performance.now();
      frameCount++;
      if (now - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastTime)));
        frameCount = 0;
        lastTime = now;
      }

      animationFrameId = requestAnimationFrame(drawLoop);
    };

    // Fast lightweight snapshot generator for logs
    const captureFastSnapshot = (videoEl: HTMLVideoElement): string => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 360;
        canvas.height = 202;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, 360, 202);
          return canvas.toDataURL('image/jpeg', 0.45);
        }
      } catch (e) {
        console.warn("[VisionGuard AI] Snapshot capture failed:", e);
      }
      return '';
    };

    // Helper function to check liveness & anti-spoofing
    const computeLivenessScore = (videoEl: HTMLVideoElement, box: any): { score: number; isLive: boolean; reason: string } => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        if (!ctx) return { score: 100, isLive: true, reason: '' };

        ctx.drawImage(videoEl, box.x, box.y, box.width, box.height, 0, 0, 48, 48);
        const imgData = ctx.getImageData(0, 0, 48, 48);
        const data = imgData.data;
        const len = data.length;

        let sum = 0;
        let whitePixels = 0;
        let skinPlausibleCount = 0;

        for (let i = 0; i < len; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = r * 0.299 + g * 0.587 + b * 0.114;
          sum += lum;

          if (r > 240 && g > 240 && b > 240) whitePixels++;
          if (r > 60 && g > 30 && b > 15 && (r - g) > 10 && r > g && r > b) skinPlausibleCount++;
        }

        const totalPixels = 48 * 48;
        const meanLum = sum / totalPixels;
        const glareRatio = whitePixels / totalPixels;
        const skinRatio = skinPlausibleCount / totalPixels;

        let diffSqSum = 0;
        for (let i = 0; i < len; i += 4) {
          const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          diffSqSum += (lum - meanLum) ** 2;
        }
        const stdDev = Math.sqrt(diffSqSum / totalPixels);

        let score = 100;
        const reasons: string[] = [];

        if (stdDev < 3.5) {
          score -= 35;
          reasons.push('Low contrast uniformity (flat image)');
        }
        if (glareRatio > 0.40) {
          score -= 45;
          reasons.push('Specular glare detected (glossy photo reflection)');
        }
        if (skinRatio < 0.02) {
          score -= 35;
          reasons.push('Implausible skin spectrum');
        }

        score = Math.max(0, Math.min(100, score));
        return {
          score,
          isLive: score >= 70,
          reason: reasons.join(', ') || 'Normal liveness signals verified'
        };
      } catch (e) {
        return { score: 50, isLive: false, reason: 'Liveness evaluation failed' };
      }
    };

    const runFaceDetection = async (video: HTMLVideoElement, displaySize: { width: number; height: number }) => {
      
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.40 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      const resized = faceapi.resizeResults(detections, displaySize);

      trackedFacesRef.current.forEach(t => { t.updated = false; });

      let authorizedCount = 0;
      let unregisteredCount = 0;
      let maxConfidenceInFrame = 0;

      // Embeddings available for matching (recognition continues even with 0 profiles as Unknown)
      const totalEmbeddings = parsedUsersRef.current.reduce((acc, u) => acc + (u.parsedEmbeddings?.length || 0), 0);

      // Rule 4: If multiple faces are detected: Immediately stop recognition.
      const hasMultipleFaces = detections.length > 1;
      if (hasMultipleFaces) {
        setMultiplePersonsWarning(true);
        setAlarmActive(true);
        sendSerialSignal("1\n");
        
        trackedFacesRef.current = resized.map((det: any) => {
          return {
            box: det.detection.box,
            history: [],
            stableName: 'MULTIPLE PERSONS DETECTED - ACCESS DENIED',
            stableIsMatch: false,
            stableIsSpoof: false,
            stableConf: 0,
            updated: true,
            lockUntil: 0
          };
        });
        
        const nowStr = new Date().toLocaleTimeString('en-IN', { hour12: false });
        setLastRecognition({
          name: 'MULTIPLE PERSONS DETECTED - ACCESS DENIED',
          status: 'Unauthorized',
          confidence: 0,
          timestamp: nowStr
        });

        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec - lastLogTimeSec > 12) {
          lastLogTimeSec = nowSec;

          const base64Snapshot = captureFastSnapshot(video);
          if (base64Snapshot) {
            setPendingPhoto(base64Snapshot);

            addLogEntry(
              'MULTIPLE PERSONS DETECTED - ACCESS DENIED',
              'MULTIPLE PERSONS DETECTED - ACCESS DENIED',
              0,
              base64Snapshot,
              undefined,
              false,    // spoofDetected
              true,     // multiplePersons
              undefined,  // spoofReason
              undefined,  // livenessScore
              detections.length  // faceCount
            );
            triggerNotification('⚠️ SECURITY ALERT: MULTIPLE PERSONS DETECTED - ACCESS DENIED');
          }
          if (soundEnabled) playAlarmBeep();
        }
        return;
      } else {
        setMultiplePersonsWarning(false);
      }

      const sortedResized = resized.sort((a: any, b: any) => 
        (b.detection.box.width * b.detection.box.height) - (a.detection.box.width * a.detection.box.height)
      );

      sortedResized.forEach((det: any, index: number) => {
        const box = det.detection.box;
        const descriptor = det.descriptor;

        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        let tracker: any = null;
        let bestTrackerDist = 999999;
        
        trackedFacesRef.current.forEach(t => {
          const tcx = t.box.x + t.box.width / 2;
          const tcy = t.box.y + t.box.height / 2;
          const dist = Math.sqrt((cx - tcx)**2 + (cy - tcy)**2);
          if (dist < bestTrackerDist) {
            bestTrackerDist = dist;
            tracker = t;
          }
        });

        // If no close tracker exists within 240px, initialize a new one
        if (bestTrackerDist > 240 || !tracker) {
          tracker = {
            box,
            history: [],
            stableName: 'Identifying...',
            stableIsMatch: false,
            stableIsSpoof: false,
            stableConf: 0,
            updated: true,
            lockUntil: 0,
            isVerifying: false,
            consecutiveSpoofFrames: 0
          };
          trackedFacesRef.current.push(tracker);
        } else {
          tracker.box = box;
          tracker.updated = true;
        }

        if (index > 0) {
          tracker.stableName = 'Background Face Ignored';
          tracker.stableIsMatch = false;
          tracker.stableIsSpoof = false;
          tracker.stableConf = 0;
          tracker.isVerifying = false;
          return;
        }

        const liveness = computeLivenessScore(video, box);
        if (!liveness.isLive) {
          tracker.consecutiveSpoofFrames = (tracker.consecutiveSpoofFrames || 0) + 1;
        } else {
          tracker.consecutiveSpoofFrames = 0;
        }

        // Liveness Spoof is declared after 5 consecutive failed frames for faster response
        const isSpoof = tracker.consecutiveSpoofFrames >= 5;

        if (isSpoof) {
          tracker.stableName = 'UNAUTHORIZED - Live Face Verification Failed.';
          tracker.stableIsMatch = false;
          tracker.stableIsSpoof = true;
          tracker.stableLivenessScore = liveness.score;
          tracker.stableConf = liveness.score;
          // Clear recognition history so stale name votes don't survive
          tracker.history = [];
          tracker.stableUserId = undefined;
          tracker.isVerifying = false;

          unregisteredCount++;
          if (liveness.score > maxConfidenceInFrame) maxConfidenceInFrame = liveness.score;

          const nowSec = Math.floor(Date.now() / 1000);
          if (nowSec - lastLogTimeSec > 12) {
            lastLogTimeSec = nowSec;

            const base64Snapshot = captureFastSnapshot(video);
            if (base64Snapshot) {
              setPendingPhoto(base64Snapshot);

              addLogEntry(
                'UNAUTHORIZED - Live Face Verification Failed.',
                'UNAUTHORIZED - Live Face Verification Failed.',
                liveness.score,
                base64Snapshot,
                undefined,
                true,           // spoofDetected
                false,          // multiplePersons
                liveness.reason, // spoofReason
                liveness.score,  // livenessScore
                1               // faceCount
              );
              triggerNotification(`⚠️ SECURITY WARNING: Live Face Verification Failed.`);
            }
            if (soundEnabled) playAlarmBeep();
          }

          const nowStr = new Date().toLocaleTimeString('en-IN', { hour12: false });
          setLastRecognition({
            name: 'UNAUTHORIZED - Live Face Verification Failed.',
            status: 'Unauthorized',
            confidence: liveness.score,
            timestamp: nowStr
          });
          return;
        }

        // ── LIVENESS PASSED — immediately clear any stale spoof state ─────────
        if (tracker.stableIsSpoof) {
          tracker.stableIsSpoof = false;
          tracker.stableName = 'VERIFYING...';
          tracker.stableIsMatch = false;
          tracker.stableConf = 0;
          tracker.history = []; // Flush stale recognition votes from spoof period
          tracker.stableUserId = undefined;
          tracker.lockUntil = 0;
          tracker.isVerifying = true;
        }

        let matchedUser: User | null = null;
        let minDistance = 1.0;

        // Perform full scan comparison across all registered users' embeddings to find the absolute best match
        for (const user of parsedUsersRef.current) {
          if (user.parsedEmbeddings && user.parsedEmbeddings.length > 0) {
            let bestDistForUser = 1.0;
            for (const emb of user.parsedEmbeddings) {
              let sum = 0;
              for (let i = 0; i < 128; i++) {
                const diff = descriptor[i] - emb[i];
                sum += diff * diff;
              }
              const dist = Math.sqrt(sum);
              if (dist < bestDistForUser) {
                bestDistForUser = dist;
              }
            }
            if (bestDistForUser < minDistance) {
              minDistance = bestDistForUser;
              matchedUser = user as any;
            }
          }
        }

        const MATCH_THRESHOLD = typeof confidenceThreshold === 'number' ? confidenceThreshold : 0.55;
        const rawIsMatch = matchedUser !== null && minDistance < MATCH_THRESHOLD;

        let rawConf = 0;
        if (rawIsMatch) {
          rawConf = Math.round(100 - (minDistance / MATCH_THRESHOLD) * 20);
          rawConf = Math.max(80, Math.min(99, rawConf));
        } else {
          const unknownDist = Math.min(minDistance, 1.0);
          rawConf = Math.round(Math.max(5, Math.min(45, (1 - unknownDist) * 55)));
        }

        const rawName = rawIsMatch && matchedUser ? matchedUser.name : 'Unknown';
        const rawUserId = rawIsMatch && matchedUser ? matchedUser.id : undefined;

        // Push current frame classification to temporal history buffer
        tracker.history.push({ name: rawName, isMatch: rawIsMatch, userId: rawUserId, conf: rawConf });
        if (tracker.history.length > 6) {
          tracker.history.shift();
        }

        // Instant classification on frame 1 without delay
        tracker.stableName = rawName;
        tracker.stableIsMatch = rawIsMatch;
        tracker.stableUserId = rawUserId;
        tracker.stableConf = rawConf;
        tracker.isVerifying = false;

        if (tracker.stableIsMatch) {
          authorizedCount++;
          if (tracker.stableConf > maxConfidenceInFrame) maxConfidenceInFrame = tracker.stableConf;
        } else {
          unregisteredCount++;
          if (tracker.stableConf > maxConfidenceInFrame) maxConfidenceInFrame = tracker.stableConf;
        }

        const nowStr = new Date().toLocaleTimeString('en-IN', { hour12: false });
        setLastRecognition({
          name: tracker.stableIsMatch ? tracker.stableName : 'Unknown',
          status: tracker.stableIsMatch ? 'Authorized' : 'Unknown',
          confidence: tracker.stableConf,
          timestamp: nowStr,
          faceDetected: true
        });
      });

      trackedFacesRef.current = trackedFacesRef.current.filter(t => t.updated);

      const hasMixedScene = authorizedCount > 0 && unregisteredCount > 0;
      setMultiplePersonsWarning(hasMultipleFaces && hasMixedScene);
      setMultipleAuthorizedInFrame(hasMultipleFaces && unregisteredCount === 0);

      if (detections.length > 0) {
        if (unregisteredCount > 0) {
          setAlarmActive(true);
          sendSerialSignal("UNAUTHORIZED");

          const nowSec = Math.floor(Date.now() / 1000);
          if (nowSec - lastLogTimeSec > 12) {
            lastLogTimeSec = nowSec;

            const base64Snapshot = captureFastSnapshot(video);
            if (base64Snapshot) {
              setPendingPhoto(base64Snapshot);

              // Upload snapshot to Supabase Storage and get public URL
              // Falls back to base64 inline if upload fails
              const logId = 'UNAUTH-' + Date.now();
              let snapshotUrl: string = base64Snapshot;
              if (isSupabaseConfigured) {
                try {
                  const uploadedUrl = await uploadDetectionSnapshotToSupabase(base64Snapshot, logId);
                  if (uploadedUrl) snapshotUrl = uploadedUrl;
                } catch (_) {
                  // Keep base64 fallback silently
                }
              }

              trackedFacesRef.current.forEach((t) => {
                if (!t.stableIsMatch) {
                  if (t.stableIsSpoof) return;
                  addLogEntry('Unauthorized Person', 'Unauthorized', t.stableConf, snapshotUrl);
                }
              });

              triggerNotification('SECURITY ALERT: Unauthorized Person Detected!');
            }
            if (soundEnabled) playAlarmBeep();
          }
        } else {
          setAlarmActive(false);
          sendSerialSignal("AUTHORIZED");

          // Normal passive face recognition logging
          trackedFacesRef.current.forEach(t => {
            if (t.stableIsMatch && t.stableUserId) {
              const nowSec = Math.floor(Date.now() / 1000);
              const userKey = t.stableUserId;
              const lastUserLog = lastUserLogTime.current[userKey] || 0;

              if (nowSec - lastUserLog > 12) {
                lastUserLogTime.current[userKey] = nowSec;

                const base64Snapshot = captureFastSnapshot(video);
                if (base64Snapshot) {
                  addLogEntry(t.stableName, 'Authorized', t.stableConf, base64Snapshot, t.stableUserId);
                }
                triggerNotification(`Access Granted: ${t.stableName}`);
              }
            }
          });
        }
      } else {
        // No faces in frame
        setAlarmActive(false);
        setMultipleAuthorizedInFrame(false);
        sendSerialSignal("OFF");
        setLastRecognition(prev => prev && prev.faceDetected ? { ...prev, faceDetected: false } : prev);
      }
    };

    animationFrameId = requestAnimationFrame(drawLoop);
    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);
    };
  // Note: parsedUsersRef is NOT in deps — the loop reads from the ref directly,
  // so user data updates never restart the animation loop (eliminates stutter).
  }, [monitoring, cameraActive, modelsLoaded, showRegisterPopup, soundEnabled]);

  const handleStart = async () => {
    initCamera();

    // Async background refresh of database (non-blocking for fast camera load)
    if (reloadUserData) {
      reloadUserData().catch(e => console.warn('[LiveMonitoring] Could not reload user data:', e));
    }

    if (isSupabaseConfigured && supabase) {
      Promise.resolve(supabase.from('face_images').select('*'))
        .then(({ data, error }) => {
          if (!error && data) setFaceImages(data);
        })
        .catch(err => console.error("[VisionGuard AI] Error loading face images database on start:", err));
    }

    setLastRecognition(null);
    setAlarmActive(false);
  };

  const handleStop = () => {
    setMonitoring(false);
    setCameraActive(false);
    setCameraLoading(false);
    stopCameraStream();
    setAlarmActive(false);
  };

  const handleResetAlarm = () => {
    setAlarmActive(false);
    // sendSerialSignal("0\n"); // Defer write signals for future implementation
  };

  const handleIgnorePopup = () => {
    setShowRegisterPopup(false);
    // 8 seconds cooldown to prevent immediate repeat trigger
    popupCooldown.current = true;
    setTimeout(() => { popupCooldown.current = false; }, 8000);
  };

  // Run automated 50-frame capture enrollment
  const startAutomatedEnrollment = () => {
    setRegStep(3);
    isEnrolling.current = true;
    setEnrollProgress(0);
    setCapturedCount(0);
    
    const tempImages: string[] = [];
    const tempDescriptors: Float32Array[] = [];

    const video = videoRef.current;
    if (!video) return;

    const TARGET_FRAMES = 20;
    let framesEnrolled = 0;
    isProcessingEnrollmentRef.current = false;
    
    const captureInterval = setInterval(async () => {
      if (framesEnrolled >= TARGET_FRAMES) {
        clearInterval(captureInterval);
        isProcessingEnrollmentRef.current = false;
        return;
      }

      if (isProcessingEnrollmentRef.current) return;
      isProcessingEnrollmentRef.current = true;

      try {
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.55 }))
          .withFaceLandmarks()
          .withFaceDescriptors();

        // Must find exactly 1 face
        if (detections.length !== 1) {
          isProcessingEnrollmentRef.current = false;
          return;
        }

        const detection = detections[0];
        const box = detection.detection.box;

        // 1. Blur Check
        const blurCanvas = document.createElement('canvas');
        blurCanvas.width = 64; blurCanvas.height = 64;
        const blurCtx = blurCanvas.getContext('2d');
        let isBlurry = false;
        if (blurCtx) {
          blurCtx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, 64, 64);
          const imgData = blurCtx.getImageData(0, 0, 64, 64).data;
          let sum = 0; const laps: number[] = [];
          for (let y = 1; y < 63; y++) {
            for (let x = 1; x < 63; x++) {
              const idx = (y * 64 + x) * 4;
              const g = imgData[idx] * 0.299 + imgData[idx+1] * 0.587 + imgData[idx+2] * 0.114;
              const l = g * 4 - (
                (imgData[(idx-4)] * 0.299 + imgData[(idx-3)] * 0.587 + imgData[(idx-2)] * 0.114) +
                (imgData[(idx+4)] * 0.299 + imgData[(idx+5)] * 0.587 + imgData[(idx+6)] * 0.114) +
                (imgData[(idx-256)] * 0.299 + imgData[(idx-255)] * 0.587 + imgData[(idx-254)] * 0.114) +
                (imgData[(idx+256)] * 0.299 + imgData[(idx+257)] * 0.587 + imgData[(idx+258)] * 0.114)
              );
              laps.push(l); sum += l;
            }
          }
          const mean = sum / laps.length;
          const variance = laps.reduce((acc, v) => acc + (v - mean) ** 2, 0) / laps.length;
          isBlurry = variance < 10.0;
        }
        if (isBlurry) {
          isProcessingEnrollmentRef.current = false;
          return;
        }

        // 2. Lighting Check
        const lightCanvas = document.createElement('canvas');
        lightCanvas.width = 32; lightCanvas.height = 32;
        const lightCtx = lightCanvas.getContext('2d');
        let tooDarkOrBright = false;
        if (lightCtx) {
          lightCtx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, 32, 32);
          const data = lightCtx.getImageData(0, 0, 32, 32).data;
          let totalLum = 0;
          for (let i = 0; i < data.length; i += 4) {
            totalLum += data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
          }
          const avgLum = totalLum / (32 * 32);
          tooDarkOrBright = (avgLum < 40 || avgLum > 220);
        }
        if (tooDarkOrBright) {
          isProcessingEnrollmentRef.current = false;
          return;
        }

        // Checks passed — save frame
        framesEnrolled++;
        const displayCount = Math.min(TARGET_FRAMES, framesEnrolled);
        setCapturedCount(displayCount);
        setEnrollProgress(Math.round((displayCount / TARGET_FRAMES) * 100));
        
        tempDescriptors.push(detection.descriptor);
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 160;
        tempCanvas.height = 120;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.drawImage(video, 0, 0, 160, 120);
          const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.5);
          tempImages.push(dataUrl);
          setCapturedImagesList(prev => [dataUrl, ...prev.slice(0, 11)]);
        }

        if (framesEnrolled >= TARGET_FRAMES) {
          clearInterval(captureInterval);
          isProcessingEnrollmentRef.current = false;
          
          if (tempDescriptors.length > 0) {
            const avgEmbedding = new Float32Array(128);
            for (let i = 0; i < 128; i++) {
              let sum = 0;
              tempDescriptors.forEach(desc => { sum += desc[i]; });
              avgEmbedding[i] = sum / tempDescriptors.length;
            }
            const base64Profile = tempImages[0] || pendingPhoto || '';
            const nowPopup = new Date();
            const istDatePopup = nowPopup.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
            const istTimePopup = nowPopup.toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });
            const uId = regId || `VG-${Math.floor(1000 + Math.random() * 9000)}`;

            setTimeout(async () => {
              try {
                let finalProfilePhoto = base64Profile;
                let finalFaceImages: string[] = [];

                if (isSupabaseConfigured && supabase) {
                  const profileUrl = await uploadImageToSupabase(base64Profile, uId, 'profile.jpg');
                  if (profileUrl) finalProfilePhoto = profileUrl;

                  for (let i = 0; i < tempImages.length; i++) {
                    const url = await uploadImageToSupabase(tempImages[i], uId, `face_${i}.jpg`);
                    if (url) finalFaceImages.push(url);
                  }
                }

                const newUser: User = {
                  id: uId,
                  name: regName || 'Biometric Subject',
                  role: regDesignation,
                  photoUrl: finalProfilePhoto,
                  profile_photo: finalProfilePhoto,
                  regDate: istDatePopup,
                  registrationDate: istDatePopup,
                  registrationTime: istTimePopup,
                  lastUpdatedDate: istDatePopup,
                  lastUpdatedTime: istTimePopup,
                  faceEmbedding: JSON.stringify(Array.from(avgEmbedding)),
                  totalCapturedImages: tempDescriptors.length,
                  status: 'Active',
                  is_enrolled: true,
                  enrollment_type: 'Biometric',
                  face_images: JSON.stringify(finalFaceImages),
                  gender: regGender,
                  age: regAge === '' ? undefined : Number(regAge),
                  designation: regDesignation,
                  department: regDepartment || undefined,
                  registration_date: istDatePopup,
                  registration_time: istTimePopup,
                  last_updated_date: istDatePopup,
                  last_updated_time: istTimePopup
                };

                // Save directly to Supabase primary, Spring Boot fallback
                if (isSupabaseConfigured && supabase) {
                  const payload: Record<string, any> = { ...newUser };
                  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
                  const { error } = await supabase.from('registered_users').upsert(payload, { onConflict: 'id' });
                  if (error) throw error;
                } else {
                  await apiService.registerUser(newUser);
                }

                // Save to face_images
                if (isSupabaseConfigured && supabase && finalFaceImages.length > 0) {
                  for (let i = 0; i < finalFaceImages.length; i++) {
                    const desc = tempDescriptors[i] || avgEmbedding;
                    await supabase.from('face_images').insert({
                      id: `${uId}_face_${i}_${Date.now()}`,
                      user_id: uId,
                      image_url: finalFaceImages[i],
                      embedding: JSON.stringify(Array.from(desc)),
                      capture_angle: `Angle_${i}`,
                      created_at: new Date().toISOString()
                    });
                  }
                }

                // Async Boot sync
                if (isSupabaseConfigured && supabase) {
                  apiService.registerUser(newUser).catch(() => {});
                }

                setRegStep(4);
                triggerNotification(`Database: Registered personnel ${newUser.name}`);
              } catch (e) {
                console.error("Save failed:", e);
                alert("Database write error.");
                setRegStep(2);
                isEnrolling.current = false;
              }
            }, 50);
          } else {
            alert("Face detection lost. Please position yourself clearly and try again.");
            setRegStep(2);
            isEnrolling.current = false;
          }
        }
      } catch (err) {
        console.error("Frame capture error:", err);
      } finally {
        isProcessingEnrollmentRef.current = false;
      }
    }, 150);
  };

  const handleFinishRegistration = async () => {
    setShowRegisterPopup(false);
    isEnrolling.current = false;
    if (reloadUserData) {
      console.log("[Face Recognition] Refreshing biometric user database profiles...");
      await reloadUserData();
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Neural Loading Banner - shown inline, does NOT hide the main layout */}
      {!modelsLoaded && !modelsLoadingError && (
        <div className="glass-panel" style={{
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          background: 'rgba(3, 0, 30, 0.9)',
          border: '1px solid var(--color-cyan)',
          boxShadow: '0 0 20px rgba(0, 243, 255, 0.2)'
        }}>
          <RefreshCw size={22} style={{ color: 'var(--color-cyan)', animation: 'spin 1.5s linear infinite', flexShrink: 0 }} />
          <div>
            <p style={{ fontFamily: 'Orbitron', fontSize: '0.9rem', color: '#ffffff', margin: 0 }}>Neural Engine Loading...</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>Downloading TinyFaceDetector & ResNet models. Please wait.</p>
          </div>
        </div>
      )}

      {modelsLoadingError && (
        <div className="glass-panel" style={{
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          border: '1px solid var(--color-red)',
          color: 'var(--color-red)'
        }}>
          <AlertTriangle size={22} />
          <div>
            <p style={{ fontFamily: 'Orbitron', fontSize: '0.9rem', margin: 0 }}>Model Load Error</p>
            <p style={{ fontSize: '0.75rem', margin: 0, opacity: 0.8 }}>Failed to load face recognition models. Check internet connection and refresh.</p>
          </div>
        </div>
      )}

      {/* Real-time Hardware & Subsystem Readiness Bar */}
      {(() => {
        const curArduinoState = arduinoConnectionState || (arduinoConnected ? 'CONNECTED' : 'DISCONNECTED');
        const isArduinoOnline = curArduinoState === 'CONNECTED';
        const isArduinoPending = curArduinoState === 'PORT_OPEN' || curArduinoState === 'HANDSHAKE_PENDING' || curArduinoState === 'CONNECTING';

        return (
          <div className="glass-panel" style={{
            padding: '12px 20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            fontSize: '0.78rem',
            background: 'rgba(5, 5, 21, 0.75)',
            border: '1px solid var(--border-glass)'
          }}>
            {/* Camera Readiness */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`sys-status-dot ${cameraActive ? 'dot-green' : cameraLoading ? 'dot-orange' : 'dot-red'}`} />
              <span style={{ color: 'var(--text-muted)' }}>CCTV Feed:</span>
              <span style={{ fontFamily: 'Orbitron', fontWeight: 600, color: cameraActive ? 'var(--color-emerald)' : cameraLoading ? '#ffb700' : 'var(--text-muted)' }}>
                {cameraActive ? 'ONLINE' : cameraLoading ? 'STARTING...' : 'OFFLINE'}
              </span>
            </div>

            {/* Neural Models Readiness */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`sys-status-dot ${modelsLoaded ? 'dot-green' : modelsLoadingError ? 'dot-red' : 'dot-orange'}`} />
              <span style={{ color: 'var(--text-muted)' }}>AI Face Engine:</span>
              <span style={{ fontFamily: 'Orbitron', fontWeight: 600, color: modelsLoaded ? 'var(--color-emerald)' : modelsLoadingError ? 'var(--color-red)' : '#ffb700' }}>
                {modelsLoaded ? 'ACTIVE' : modelsLoadingError ? 'ERROR' : 'LOADING...'}
              </span>
            </div>

            {/* Biometrics Synced */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`sys-status-dot ${registeredUsers.length > 0 ? 'dot-green' : 'dot-orange'}`} />
              <span style={{ color: 'var(--text-muted)' }}>Personnel DB:</span>
              <span style={{ fontFamily: 'Orbitron', fontWeight: 600, color: registeredUsers.length > 0 ? 'var(--color-cyan)' : '#ffb700' }}>
                {registeredUsers.length} PROFILES
              </span>
            </div>

            {/* Arduino Alert System Readiness */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`sys-status-dot ${isArduinoOnline ? 'dot-green' : isArduinoPending ? 'dot-orange' : 'dot-red'}`} />
              <span style={{ color: 'var(--text-muted)' }}>Alert System:</span>
              <span style={{ fontFamily: 'Orbitron', fontWeight: 600, color: isArduinoOnline ? 'var(--color-emerald)' : isArduinoPending ? '#ffb700' : 'var(--text-muted)' }}>
                {isArduinoOnline 
                  ? 'ARDUINO CONNECTED'
                  : isArduinoPending
                  ? 'HANDSHAKE PENDING...'
                  : curArduinoState === 'ERROR'
                  ? 'DEVICE ERROR'
                  : 'OFFLINE (ALERTS DISABLED)'}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Main Two-Column Layout — always visible */}
      <div className="two-column-layout">
        
        {/* Left Column: CCTV Stream Player */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Header info bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontFamily: 'Orbitron', fontSize: '1.2rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} style={{ color: monitoring ? 'var(--color-cyan)' : 'var(--text-muted)' }} />
                  CCTV Live Access Monitoring
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Active node: NODE-AP092 | Standard: 16:9 CCTV Widescreen | Face Recognition Active
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span className={`cyber-badge ${cameraLoading ? 'badge-unknown' : cameraActive ? 'badge-authorized' : 'badge-unknown'}`} style={{ fontSize: '0.65rem' }}>
                  {cameraLoading ? 'STARTING...' : cameraActive ? 'Camera Online' : cameraError ? 'Camera Offline (Error)' : 'Camera Offline'}
                </span>
                <span className={`cyber-badge ${monitoring ? 'badge-authorized' : 'badge-unknown'}`} style={{ fontSize: '0.65rem' }}>
                  {monitoring ? 'SCANNING' : 'STANDBY'}
                </span>
              </div>
            </div>

            {/* Video Viewport Frame */}
            <div className="hologram-effect" style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16/9',
              background: '#010108',
              border: `2px solid ${alarmActive ? 'var(--color-red)' : monitoring ? 'var(--color-cyan)' : 'var(--border-glass)'}`,
              boxShadow: alarmActive ? '0 0 30px rgba(255, 59, 48, 0.4)' : monitoring ? '0 0 20px rgba(0, 243, 255, 0.2)' : 'none',
              borderRadius: '16px',
              overflow: 'hidden',
              transition: 'all 0.5s ease'
            }}>
              
              {/* CCTV Video */}
              <video 
                ref={videoRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: (cameraActive && !cameraLoading) ? 1 : 0
                }}
                muted
                playsInline
              />

              {/* Bounding Box Drawing Overlay Canvas */}
              <canvas 
                ref={canvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  zIndex: 3
                }}
              />

              {/* Flashing Red Security Alert Banner */}
              {alarmActive && (
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(220, 38, 38, 0.98)',
                  color: '#ffffff',
                  padding: '8px 18px',
                  borderRadius: '12px',
                  fontFamily: 'Orbitron, monospace',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  zIndex: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  boxShadow: '0 0 25px rgba(220, 38, 38, 0.75)',
                  border: '1.5px solid rgba(255, 255, 255, 0.35)',
                  animation: 'pulse 1.5s infinite',
                  textAlign: 'center',
                  width: '90%',
                  maxWidth: '350px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={16} style={{ color: '#ffffff' }} />
                    <span>⚠ SECURITY WARNING</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.95)' }}>Unauthorized Person Detected</span>
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.75)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Restricted Area Access Denied</span>
                </div>
              )}

              {/* Multiple Authorized Users Green Banner */}
              {monitoring && cameraActive && !alarmActive && multipleAuthorizedInFrame && (
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0, 180, 90, 0.98)',
                  color: '#ffffff',
                  padding: '8px 20px',
                  borderRadius: '20px',
                  fontFamily: 'Orbitron, monospace',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 0 20px rgba(0, 180, 90, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}>
                  <span>👥 Multiple Authorized Users</span>
                </div>
              )}

              {/* Multiple Persons Warning (Mixed Authorized + Unauthorized) */}
              {monitoring && cameraActive && multiplePersonsWarning && (
                <div style={{
                  position: 'absolute',
                  bottom: '55px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(220, 150, 20, 0.95)',
                  color: '#ffffff',
                  padding: '10px 20px',
                  borderRadius: '30px',
                  fontFamily: 'Orbitron, monospace',
                  fontSize: '0.78rem',
                  fontWeight: 'bold',
                  zIndex: 15,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 0 20px rgba(220, 150, 20, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  animation: 'pulse 1.5s infinite',
                  whiteSpace: 'nowrap'
                }}>
                  <AlertTriangle size={16} />
                  <span>⚠️ MULTIPLE PERSONS DETECTED - ACCESS DENIED</span>
                </div>
              )}

              {/* Video Overlay Telemetry HUD (Absolute corners) */}
              {cameraActive && (
                <>
                  {/* Top Left HUD */}
                  <div style={{
                    position: 'absolute',
                    top: '15px',
                    left: '15px',
                    zIndex: 5,
                    background: 'rgba(5, 5, 21, 0.65)',
                    backdropFilter: 'blur(4px)',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.7rem',
                    fontFamily: 'Orbitron',
                    border: '1px solid var(--border-glass)',
                    color: '#ffffff'
                  }}>
                    REC: STREAM_AP-092
                  </div>

                  {/* Top Right HUD */}
                  <div style={{
                    position: 'absolute',
                    top: '15px',
                    right: '15px',
                    zIndex: 5,
                    background: 'rgba(5, 5, 21, 0.65)',
                    backdropFilter: 'blur(4px)',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.7rem',
                    fontFamily: 'Orbitron',
                    border: '1px solid var(--border-glass)',
                    color: monitoring ? 'var(--color-cyan)' : 'var(--text-muted)'
                  }}>
                    {monitoring ? 'SCAN_CORE: ACTIVE' : 'SCAN_CORE: IDLE'}
                  </div>

                  {/* Bottom Left HUD */}
                  <div style={{
                    position: 'absolute',
                    bottom: '15px',
                    left: '15px',
                    zIndex: 5,
                    background: 'rgba(5, 5, 21, 0.65)',
                    backdropFilter: 'blur(4px)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '0.68rem',
                    fontFamily: 'JetBrains Mono',
                    border: '1px solid var(--border-glass)',
                    color: '#ffffff',
                    lineHeight: '1.4'
                  }}>
                    <div>TIME: {time.toLocaleTimeString()}</div>
                    <div>FPS: {fps} | LINK: {arduinoStatusText}</div>
                  </div>
                </>
              )}

              {/* Laser Scanning Line */}
              {monitoring && !isEnrolling.current && (
                <div style={{
                  position: 'absolute',
                  left: 0,
                  width: '100%',
                  height: '4px',
                  background: alarmActive ? 'rgba(255, 59, 48, 0.8)' : 'rgba(0, 243, 255, 0.8)',
                  boxShadow: alarmActive ? '0 0 15px rgba(255, 59, 48, 0.8)' : '0 0 15px rgba(0, 243, 255, 0.8)',
                  animation: 'laserScan 3.5s ease-in-out infinite',
                  zIndex: 4,
                  pointerEvents: 'none'
                }} />
              )}

              {/* Starting Camera Loading Overlay */}
              {cameraLoading && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(5, 5, 21, 0.92)',
                  color: 'var(--color-cyan)',
                  zIndex: 10,
                  gap: '12px'
                }}>
                  <RefreshCw size={44} style={{ animation: 'spin 1.2s linear infinite', color: 'var(--color-cyan)' }} />
                  <p style={{ fontFamily: 'Orbitron', fontSize: '1.1rem', color: '#ffffff', margin: 0, fontWeight: 700 }}>Starting Camera...</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Requesting browser camera permission & stream access...</p>
                </div>
              )}

              {/* Camera Error Display with Retry Button */}
              {!cameraLoading && cameraError && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(5, 5, 21, 0.95)',
                  color: 'var(--color-red)',
                  zIndex: 10,
                  gap: '14px',
                  padding: '24px',
                  textAlign: 'center'
                }}>
                  <CameraOff size={48} style={{ color: 'var(--color-red)', opacity: 0.9 }} />
                  <p style={{ fontFamily: 'Orbitron', fontSize: '1.05rem', color: '#ffffff', margin: 0, fontWeight: 700 }}>Camera Access Failed</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, maxWidth: '420px', lineHeight: '1.4' }}>
                    {cameraError}
                  </p>
                  <button 
                    className="btn-3d btn-cyan" 
                    style={{ padding: '10px 22px', fontSize: '0.85rem', borderRadius: '10px', marginTop: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    onClick={initCamera}
                  >
                    <RefreshCw size={16} />
                    Retry Camera
                  </button>
                </div>
              )}

              {/* Camera Standby Display (when manually stopped) */}
              {!cameraActive && !cameraLoading && !cameraError && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(5, 5, 21, 0.9)',
                  color: 'var(--text-muted)',
                  zIndex: 5,
                  gap: '12px'
                }}>
                  <CameraOff size={48} style={{ opacity: 0.3 }} />
                  <p style={{ fontWeight: 600, color: '#ffffff', margin: 0 }}>CCTV Camera Standby</p>
                  <p style={{ fontSize: '0.78rem', opacity: 0.7, margin: 0 }}>Click Start Monitoring below to re-enable camera feed.</p>
                  <button 
                    className="btn-3d btn-cyan" 
                    style={{ padding: '8px 18px', fontSize: '0.82rem', borderRadius: '10px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    onClick={handleStart}
                  >
                    <Camera size={15} />
                    Start Monitoring
                  </button>
                </div>
              )}
            </div>

            {/* Viewport Control Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                {!monitoring ? (
                  <button className="btn-3d btn-cyan" style={{ padding: '8px 18px', fontSize: '0.82rem', borderRadius: '10px' }} onClick={handleStart}>
                    <Camera size={15} />
                    Start Monitoring
                  </button>
                ) : (
                  <button className="btn-3d btn-red" style={{ padding: '8px 18px', fontSize: '0.82rem', borderRadius: '10px' }} onClick={handleStop}>
                    <CameraOff size={15} />
                    Stop Monitoring
                  </button>
                )}
                
                {alarmActive && (
                  <button className="btn-3d btn-purple" style={{ padding: '8px 18px', fontSize: '0.82rem', borderRadius: '10px' }} onClick={handleResetAlarm}>
                    <RefreshCw size={15} />
                    Reset Alarm
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn-3d btn-secondary" 
                  style={{ padding: '8px 12px', borderRadius: '10px' }}
                  onClick={() => setSoundEnabled(!soundEnabled)}
                >
                  {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </button>
              </div>
            </div>

          </div>

          {/* Right Column: Active Telemetry Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Status Info Card */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                IO Terminal Links
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="glass-panel" style={{ padding: '12px', background: 'rgba(255,255,255,0.02)' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>Arduino Status</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: arduinoConnected ? 'var(--color-emerald)' : 'var(--color-red)' }}>
                    {arduinoConnected ? '🟢 Connected' : '🔴 Disconnected'}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                    {arduinoConnected ? 'COM Port Linked' : 'No Arduino Detected'}
                  </span>
                </div>
                <div className="glass-panel" style={{ padding: '12px', background: 'rgba(255,255,255,0.02)' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>Alarm Audio</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: soundEnabled ? 'var(--color-emerald)' : 'var(--text-muted)' }}>
                    {soundEnabled ? 'ARMED' : 'MUTED'}
                  </span>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <Calendar size={14} />
                <span>{time.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                <span style={{ margin: '0 4px' }}>|</span>
                <Clock size={14} />
                <span>{time.toLocaleTimeString()}</span>
              </div>
            </div>

            {/* Neural Load indicators */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Face Recognition Engine
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Detection Model:</span>
                  <span style={{ color: '#ffffff', fontWeight: 600 }}>TinyFaceDetector</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Descriptor Model:</span>
                  <span style={{ color: '#ffffff', fontWeight: 600 }}>FaceLandmarks-68 / ResNet</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>DB Profiles Loaded:</span>
                  <span style={{ color: 'var(--color-cyan)', fontWeight: 700 }}>{registeredUsers.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Embeddings Ready:</span>
                  <span style={{ color: parsedUsers.some(u => u.parsedEmbeddings && u.parsedEmbeddings.length > 0) ? 'var(--color-emerald)' : 'var(--color-orange)', fontWeight: 700 }}>
                    {parsedUsers.reduce((acc, u) => acc + (u.parsedEmbeddings?.length || 0), 0)} templates ({registeredUsers.length} profiles)
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>AI Models Status:</span>
                  <span style={{ color: (modelsLoaded && biometricsLoaded) ? 'var(--color-emerald)' : 'var(--color-orange)', fontWeight: 700 }}>
                    {modelsLoaded ? (biometricsLoaded ? '✅ Ready' : '⏳ DB Parsing...') : '⏳ Loading...'}
                  </span>
                </div>
              </div>
            </div>

            {/* LIVE RECOGNITION STATUS CARD */}
            <div className="glass-panel" style={{
              padding: '24px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              flex: 1,
              border: alarmActive
                ? '2px solid var(--color-red)'
                : lastRecognition?.status === 'Authorized'
                ? '2px solid var(--color-emerald)'
                : lastRecognition?.status === 'Unknown'
                ? '2px solid var(--color-red)'
                : '1px solid var(--border-glass)',
              boxShadow: alarmActive
                ? '0 0 24px rgba(255,59,48,0.4)'
                : lastRecognition?.status === 'Authorized'
                ? '0 0 24px rgba(0,255,136,0.3)'
                : lastRecognition?.status === 'Unknown'
                ? '0 0 24px rgba(255,59,48,0.3)'
                : 'none',
              transition: 'all 0.4s ease'
            }}>
              {/* Status Icon */}
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                background: alarmActive
                  ? 'rgba(255,59,48,0.15)'
                  : lastRecognition?.status === 'Authorized'
                  ? 'rgba(0,255,136,0.15)'
                  : lastRecognition?.status === 'Unknown'
                  ? 'rgba(255,59,48,0.15)'
                  : 'rgba(255,255,255,0.04)',
                border: alarmActive
                  ? '2px solid var(--color-red)'
                  : lastRecognition?.status === 'Authorized'
                  ? '2px solid var(--color-emerald)'
                  : lastRecognition?.status === 'Unknown'
                  ? '2px solid var(--color-red)'
                  : '1px solid var(--border-glass)',
              }}>
                {alarmActive ? '🚨' : lastRecognition?.status === 'Verifying' ? '⏳' : lastRecognition?.status === 'Authorized' ? '✅' : lastRecognition?.status === 'Unknown' ? '🔴' : '🛡️'}
              </div>

              {/* Status Label & Identification Telemetry */}
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: alarmActive || lastRecognition?.status === 'Unknown'
                    ? 'rgba(255, 59, 48, 0.12)'
                    : lastRecognition?.status === 'Authorized'
                    ? 'rgba(0, 255, 136, 0.12)'
                    : 'rgba(255, 255, 255, 0.03)',
                  border: alarmActive || lastRecognition?.status === 'Unknown'
                    ? '1.5px solid var(--color-red)'
                    : lastRecognition?.status === 'Authorized'
                    ? '1.5px solid var(--color-emerald)'
                    : '1px solid var(--border-glass)',
                  textAlign: 'center'
                }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>ACCESS VERIFICATION:</span>
                  <div style={{
                    fontFamily: 'Orbitron',
                    fontSize: '1.05rem',
                    fontWeight: 900,
                    letterSpacing: '1px',
                    marginTop: '2px',
                    color: alarmActive || lastRecognition?.status === 'Unknown'
                      ? 'var(--color-red)'
                      : lastRecognition?.status === 'Authorized'
                      ? 'var(--color-emerald)'
                      : 'var(--text-muted)'
                  }}>
                    {lastRecognition?.status === 'Authorized' ? 'AUTHORIZED' :
                     lastRecognition?.status === 'Unknown' || alarmActive ? 'UNAUTHORIZED' :
                     monitoring ? 'SCANNING...' : 'STANDBY'}
                  </div>
                </div>

                <div style={{
                  background: 'rgba(5, 5, 21, 0.5)',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '0.82rem',
                  border: '1px solid var(--border-glass)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Face Detected:</span>
                    <span style={{ fontWeight: 700, color: lastRecognition?.faceDetected ? 'var(--color-emerald)' : 'var(--text-muted)' }}>
                      {lastRecognition?.faceDetected ? 'YES' : (monitoring ? 'Scanning...' : 'No')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Name:</span>
                    <span style={{ fontWeight: 700, color: '#ffffff' }}>
                      {lastRecognition?.faceDetected ? lastRecognition.name : (monitoring ? 'Searching...' : '--')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                    <span style={{
                      fontWeight: 800,
                      fontFamily: 'Orbitron',
                      fontSize: '0.78rem',
                      color: lastRecognition?.status === 'Authorized'
                        ? 'var(--color-emerald)'
                        : lastRecognition?.status === 'Unknown'
                        ? 'var(--color-red)'
                        : 'var(--text-muted)'
                    }}>
                      {lastRecognition?.faceDetected
                        ? (lastRecognition.status === 'Authorized' ? 'AUTHORIZED' : 'UNAUTHORIZED')
                        : '--'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Confidence:</span>
                    <span style={{ fontWeight: 700, color: lastRecognition?.faceDetected ? 'var(--color-cyan)' : 'var(--text-muted)' }}>
                      {lastRecognition?.faceDetected ? `${lastRecognition.confidence}%` : '--'}
                    </span>
                  </div>
                </div>
              </div>
            </div>


          </div>

        </div>


      {/* ============================================================== */}
      {/* POPUP MODAL: NEW FACE DETECTED & REGISTRATION SYSTEM FLOW      */}
      {/* ============================================================== */}
      {showRegisterPopup && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5, 5, 21, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-panel fade-in" style={{
            width: '100%',
            maxWidth: '560px',
            padding: '30px',
            border: '1px solid var(--border-glass-glow)',
            boxShadow: '0 0 30px rgba(0, 243, 255, 0.2)'
          }}>

            {/* STEP 1: WOULD YOU LIKE TO REGISTER PROMPT */}
            {regStep === 1 && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  border: '2px solid var(--color-red)',
                  background: 'rgba(220,38,38,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-red)',
                  margin: '0 auto'
                }}>
                  <AlertTriangle size={32} />
                </div>
                <div>
                  <h3 style={{ fontFamily: 'Orbitron', fontSize: '1.4rem', color: '#ffffff', marginBottom: '8px' }}>
                    Unauthorized Face Detected
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    An unauthorized individual has attempted to access the restricted area. Would you like to register this person?
                  </p>
                </div>

                {pendingPhoto && (
                  <div style={{ margin: '10px 0' }}>
                    <img 
                      src={pendingPhoto} 
                      alt="Unauthorized snapshot" 
                      style={{
                        width: '120px',
                        height: '120px',
                        borderRadius: '12px',
                        border: '2px solid var(--color-red)',
                        objectFit: 'cover'
                      }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', gap: '14px', marginTop: '10px' }}>
                  <button className="btn-3d btn-cyan" style={{ flex: 1 }} onClick={() => {
                    const randomNum = Math.floor(1000 + Math.random() * 9000);
                    setRegId(`VG-${randomNum}`);
                    setRegStep(2);
                  }}>
                    Register
                  </button>
                  <button className="btn-3d btn-secondary" style={{ flex: 1 }} onClick={handleIgnorePopup}>
                    Ignore
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: FORM DETAILS (NAME & EMPLOYEE ID) */}
            {regStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h3 style={{ fontFamily: 'Orbitron', fontSize: '1.25rem', color: '#ffffff', marginBottom: '4px' }}>
                    Register Biometric Profile
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Enroll the scanned individual in the authorized database.
                  </span>
                </div>

                <div className="cyber-input-group">
                  <label className="cyber-input-label">Personnel Full Name *</label>
                  <input 
                    type="text" 
                    className="cyber-input" 
                    placeholder="e.g. John Connor"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="cyber-input-group">
                    <label className="cyber-input-label">Gender</label>
                    <select 
                      className="cyber-input cyber-select"
                      value={regGender}
                      onChange={(e) => setRegGender(e.target.value)}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="cyber-input-group">
                    <label className="cyber-input-label">Age</label>
                    <input 
                      type="number" 
                      className="cyber-input" 
                      placeholder="e.g. 34" 
                      value={regAge}
                      onChange={(e) => setRegAge(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="cyber-input-group">
                    <label className="cyber-input-label">Designation</label>
                    <select 
                      className="cyber-input cyber-select"
                      value={regDesignation}
                      onChange={(e) => setRegDesignation(e.target.value)}
                    >
                      <option value="Staff Officer">Staff Officer</option>
                      <option value="Administrator">Administrator</option>
                      <option value="Security Officer">Security Officer</option>
                      <option value="Technician">Technician</option>
                      <option value="Engineer">Engineer</option>
                      <option value="VIP">VIP</option>
                      <option value="Contractor">Contractor</option>
                    </select>
                  </div>
                  <div className="cyber-input-group">
                    <label className="cyber-input-label">Department (Optional)</label>
                    <input 
                      type="text" 
                      className="cyber-input" 
                      placeholder="e.g. Security" 
                      value={regDepartment}
                      onChange={(e) => setRegDepartment(e.target.value)}
                    />
                  </div>
                </div>

                <div className="cyber-input-group">
                  <label className="cyber-input-label">Employee ID / User ID</label>
                  <input 
                    type="text" 
                    className="cyber-input" 
                    placeholder="e.g. VG-4928"
                    value={regId}
                    onChange={(e) => setRegId(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '14px', marginTop: '10px' }}>
                  <button 
                    className="btn-3d btn-cyan" 
                    style={{ flex: 1 }} 
                    disabled={!regName.trim() || !regId.trim()}
                    onClick={startAutomatedEnrollment}
                  >
                    Start Biometric Scan
                  </button>
                  <button className="btn-3d btn-secondary" style={{ flex: 1 }} onClick={() => setRegStep(1)}>
                    Back
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: AUTOMATED 50 FRAME CAPTURE PROCESS */}
            {regStep === 3 && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <h3 style={{ fontFamily: 'Orbitron', fontSize: '1.25rem', color: '#ffffff', marginBottom: '4px' }}>
                    Capturing Biometric Landmarks
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Slowly rotate your head left, right, up, and down.
                  </span>
                </div>

                {/* Progress bar info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Orbitron', fontSize: '0.8rem', color: 'var(--color-cyan)' }}>
                  <span>Frame Capture Loop</span>
                  <span>{capturedCount} / 50</span>
                </div>
                <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{ width: `${enrollProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-cyan), var(--color-purple))', transition: 'width 0.1s ease' }} />
                </div>

                {/* Captured frames preview swatches */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: '8px',
                  maxHeight: '130px',
                  overflowY: 'auto',
                  padding: '4px',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '12px'
                }}>
                  {capturedImagesList.map((img, idx) => (
                    <img 
                      key={idx} 
                      src={img} 
                      alt="captured index" 
                      style={{
                        width: '100%',
                        aspectRatio: '1',
                        borderRadius: '6px',
                        objectFit: 'cover'
                      }}
                    />
                  ))}
                  {capturedImagesList.length === 0 && (
                    <div style={{ gridColumn: 'span 6', padding: '24px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Looking for face... Stand in front of camera.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 4: SUCCESS */}
            {regStep === 4 && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  border: '2px solid var(--color-emerald)',
                  background: 'rgba(0,255,136,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-emerald)',
                  margin: '0 auto'
                }}>
                  <CheckCircle size={32} />
                </div>
                <div>
                  <h3 style={{ fontFamily: 'Orbitron', fontSize: '1.3rem', color: '#ffffff', marginBottom: '8px' }}>
                    User Registered Successfully
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Personnel profile database record created. Facial landmarks mapped to security nodes.
                  </p>
                </div>

                <button className="btn-3d btn-cyan" style={{ width: '100%', marginTop: '10px' }} onClick={handleFinishRegistration}>
                  Close & Resume
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};
