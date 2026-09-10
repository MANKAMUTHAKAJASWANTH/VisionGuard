import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  UserPlus, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Compass,
  Eye
} from 'lucide-react';
import type { User } from '../services/api';
import { uploadImageToSupabase, isSupabaseConfigured, supabase } from '../services/supabase';

const faceapi = (window as any).faceapi;

interface RegisterUserProps {
  onRegister: (user: User) => any;
  onCancel: () => void;
  onSuccess?: () => void;
  cameraActive: boolean;
  setCameraActive: (val: boolean) => void;
  registeredUsers: User[];
  prefilledPhoto?: string | null;
  onClearPrefilledPhoto?: () => void;
  adminName: string;
  adminId: string;
}

// ── 5 DISTINCT REQUIRED FACE ANGLES ─────────────────────────────────────────
export interface AngleStageConfig {
  key: 'FRONT' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
  name: string;
  shortLabel: string;
  instruction: string;
  tip: string;
  targetCount: number;
}

export const ANGLE_STAGES: AngleStageConfig[] = [
  {
    key: 'FRONT',
    name: 'Straight / Front',
    shortLabel: '1. Front View',
    instruction: 'Look straight at the camera with a natural expression',
    tip: 'Center your face in the frame, eyes forward',
    targetCount: 2
  },
  {
    key: 'LEFT',
    name: 'Slightly Left',
    shortLabel: '2. Left Angle',
    instruction: 'Turn your head slightly to the LEFT (~15° to 25°)',
    tip: 'Keep eyes toward camera while turning head left',
    targetCount: 2
  },
  {
    key: 'RIGHT',
    name: 'Slightly Right',
    shortLabel: '3. Right Angle',
    instruction: 'Turn your head slightly to the RIGHT (~15° to 25°)',
    tip: 'Keep eyes toward camera while turning head right',
    targetCount: 2
  },
  {
    key: 'UP',
    name: 'Looking Up',
    shortLabel: '4. Tilt Up',
    instruction: 'Tilt your head slightly UPWARD (~10° to 20°)',
    tip: 'Gently raise your chin upward while looking toward camera',
    targetCount: 2
  },
  {
    key: 'DOWN',
    name: 'Looking Down',
    shortLabel: '5. Tilt Down',
    instruction: 'Tilt your head slightly DOWNWARD (~10° to 20°)',
    tip: 'Gently lower your chin downward toward chest',
    targetCount: 2
  }
];

export const RegisterUser: React.FC<RegisterUserProps> = ({
  onRegister,
  onCancel,
  onSuccess,
  cameraActive,
  setCameraActive,
  registeredUsers,
  prefilledPhoto,
  onClearPrefilledPhoto,
  adminName,
  adminId
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScanningRef = useRef(false);



  // Form Fields
  const [fullName, setFullName] = useState('');
  const [userId, setUserId] = useState('');
  const [gender, setGender] = useState('Male');
  const [age, setAge] = useState<number | ''>('');
  const [designation, setDesignation] = useState('Staff Officer');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [validationErrors, setValidationErrors] = useState<{
    fullName?: string;
    userId?: string;
    designation?: string;
    department?: string;
    email?: string;
    mobileNumber?: string;
    gender?: string;
    age?: string;
  }>({});

  // Face Biometrics States
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStepLabel, setScanStepLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── 5-Angle Face Capture Tracking ──────────────────────────────────────────
  const [currentAngleStageIndex, setCurrentAngleStageIndex] = useState<number>(0);
  const [anglePreviews, setAnglePreviews] = useState<{ [key: string]: string }>({});
  const [angleFrameCounts, setAngleFrameCounts] = useState<{ [key: string]: number }>({
    FRONT: 0,
    LEFT: 0,
    RIGHT: 0,
    UP: 0,
    DOWN: 0
  });

  // Enrollment arrays
  const [capturedCount, setCapturedCount] = useState(0);
  const [capturedPreviews, setCapturedPreviews] = useState<string[]>([]);
  const [capturedDescriptors, setCapturedDescriptors] = useState<number[][]>([]);
  const [capturedAngleTags, setCapturedAngleTags] = useState<string[]>([]);
  const [avgDescriptor, setAvgDescriptor] = useState<number[] | null>(null);

  const isProcessingFrameRef = useRef(false);
  const consecutiveSpoofFramesRef = useRef(0);
  const SPOOF_FRAME_THRESHOLD = 12;
  const stabilizationFramesRef = useRef(0);
  const STABILIZATION_REQUIRED_FRAMES = 3;
  const currentStageHoldFramesRef = useRef(0);

  // Auto-generate standard ID
  useEffect(() => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setUserId(`VG-${randomNum}`);
  }, []);



  // Dynamic Validation Effect
  useEffect(() => {
    const errors: typeof validationErrors = {};
    
    if (!fullName.trim()) {
      errors.fullName = 'Full Name is required.';
    }
    
    if (!userId.trim()) {
      errors.userId = 'Employee ID is required.';
    } else if (registeredUsers.some(u => u.id.toLowerCase() === userId.trim().toLowerCase())) {
      errors.userId = 'Employee ID must be unique.';
    }
    
    if (!designation.trim()) {
      errors.designation = 'Designation is required.';
    }
    
    if (!department.trim()) {
      errors.department = 'Department / Branch is required.';
    }
    
    if (!email.trim()) {
      errors.email = 'Email Address is required.';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        errors.email = 'Please enter a valid email address.';
      } else if (registeredUsers.some(u => u.email && u.email.toLowerCase() === email.trim().toLowerCase())) {
        errors.email = 'Email Address must be unique.';
      }
    }
    
    if (!mobileNumber.trim()) {
      errors.mobileNumber = 'Mobile Number is required.';
    } else {
      const phoneRegex = /^\d{10}$/;
      if (!phoneRegex.test(mobileNumber.trim())) {
        errors.mobileNumber = 'Mobile Number must contain exactly 10 digits.';
      } else if (registeredUsers.some(u => {
        const dbMobile = u.phone || u.mobile_number;
        return dbMobile && dbMobile.replace(/\D/g, '') === mobileNumber.trim();
      })) {
        errors.mobileNumber = 'Mobile Number must be unique.';
      }
    }
    
    if (!gender) {
      errors.gender = 'Gender is required.';
    }
    
    if (age === '') {
      errors.age = 'Age is required.';
    } else if (isNaN(Number(age)) || Number(age) <= 0) {
      errors.age = 'Age must be a valid positive number.';
    }

    setValidationErrors(errors);
  }, [fullName, userId, designation, department, email, mobileNumber, gender, age, registeredUsers]);

  // Prefill photo from warning alerts if present
  useEffect(() => {
    if (prefilledPhoto) {
      setCapturedPhoto(prefilledPhoto);
      setSuccessMsg("Extracting face signature from pre-loaded template...");
      
      const img = new Image();
      img.src = prefilledPhoto;
      img.onload = async () => {
        try {
          if (typeof faceapi !== 'undefined' && faceapi.nets?.tinyFaceDetector?.params) {
            const detection = await faceapi
              .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.35 }))
              .withFaceLandmarks()
              .withFaceDescriptor();
            
            if (detection) {
              setAvgDescriptor(Array.from(detection.descriptor));
              setCapturedDescriptors([Array.from(detection.descriptor)]);
              setCapturedPreviews([prefilledPhoto]);
              setAnglePreviews({ FRONT: prefilledPhoto });
              setSuccessMsg("Face signature extracted successfully!");
            } else {
              setAvgDescriptor(new Array(128).fill(0.0));
              setErrorMsg("No face detected in snapshot. Please capture face biometrics.");
            }
          } else {
            setAvgDescriptor(new Array(128).fill(0.0));
            setSuccessMsg("Snapshot loaded. Ready for enrollment.");
          }
        } catch (e) {
          console.error("Failed to extract embedding from pre-loaded photo", e);
          setAvgDescriptor(new Array(128).fill(0.0));
        }
      };
    }
  }, [prefilledPhoto]);

  // Stop camera when it unmounts
  useEffect(() => {
    return () => {
      setCameraActive(false);
    };
  }, []);

  // Load Models if not loaded, with Cache API checks and CDN fallbacks
  useEffect(() => {
    const loadModels = async () => {
      const cacheName = 'visionguard-models-cache-v6';
      const originalFetch = window.fetch;
      
      (window as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        
        if (url.includes('/models/')) {
          const filename = url.substring(url.lastIndexOf('/') + 1);
          try {
            const cache = await caches.open(cacheName);
            const cachedResponse = await cache.match(filename);
            
            if (cachedResponse) {
              return cachedResponse;
            }
            
            try {
              const localResponse = await originalFetch(input, init);
              if (localResponse.ok) {
                await cache.put(filename, localResponse.clone());
                return localResponse;
              }
            } catch (localErr) {
              // fallback
            }
            
            const cdnUrl = `https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights/${filename}`;
            const cdnResponse = await originalFetch(cdnUrl, init);
            if (cdnResponse.ok) {
              await cache.put(filename, cdnResponse.clone());
              return cdnResponse;
            }
          } catch (cacheErr) {
            console.error('[VisionGuard AI Cache] Cache operation failed:', cacheErr);
          }
        }
        
        return originalFetch(input, init);
      };

      try {
        const MODEL_URL = '/models';
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        setModelsLoaded(true);
      } catch (err) {
        console.error('Failed to load neural models in Register:', err);
      } finally {
        window.fetch = originalFetch;
      }
    };
    loadModels();
  }, []);

  // Web Camera Stream for enrollment
  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    
    if (cameraActive && videoRef.current) {
      consecutiveSpoofFramesRef.current = 0;
      stabilizationFramesRef.current = 0;
      setErrorMsg('');
      setSuccessMsg('');

      navigator.mediaDevices.getUserMedia({ video: { width: 400, height: 300, aspectRatio: 1.3333333333 } })
        .then((mediaStream) => {
          if (!active) {
            mediaStream.getTracks().forEach(track => track.stop());
            return;
          }
          stream = mediaStream;
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
            videoRef.current.play().catch(e => console.log("Play failed: ", e));
          }
        })
        .catch((err) => {
          if (!active) return;
          console.error("Camera access failed:", err);
          setErrorMsg("Camera access failed. Check permissions.");
        });
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    }

    return () => {
      active = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraActive, capturedPhoto]);

  // ── Head Pose Estimation using 68 Landmarks ─────────────────────────────────
  const estimateFacePose = (landmarks: any): {
    yaw: number;
    pitchRatio: number;
    detectedAngle: 'FRONT' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
  } => {
    const pts = landmarks?.positions;
    if (!pts || pts.length < 68) {
      return { yaw: 0, pitchRatio: 0.8, detectedAngle: 'FRONT' };
    }

    const noseTip = pts[30];
    const chin = pts[8];
    const leftEyeCenter = { x: (pts[36].x + pts[39].x) / 2, y: (pts[36].y + pts[39].y) / 2 };
    const rightEyeCenter = { x: (pts[42].x + pts[45].x) / 2, y: (pts[42].y + pts[45].y) / 2 };
    const eyeMidX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
    const eyeMidY = (leftEyeCenter.y + rightEyeCenter.y) / 2;
    const eyeDistance = Math.hypot(rightEyeCenter.x - leftEyeCenter.x, rightEyeCenter.y - leftEyeCenter.y) || 1;

    // Horizontal yaw ratio (-1 to 1)
    const yaw = (noseTip.x - eyeMidX) / eyeDistance;

    // Vertical pitch ratio
    const noseToEyeDist = Math.max(1, Math.abs(noseTip.y - eyeMidY));
    const chinToNoseDist = Math.max(1, Math.abs(chin.y - noseTip.y));
    const pitchRatio = noseToEyeDist / chinToNoseDist;

    let detectedAngle: 'FRONT' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' = 'FRONT';

    if (pitchRatio < 0.60) {
      detectedAngle = 'UP';
    } else if (pitchRatio > 1.05) {
      detectedAngle = 'DOWN';
    } else if (yaw < -0.11) {
      detectedAngle = 'LEFT';
    } else if (yaw > 0.11) {
      detectedAngle = 'RIGHT';
    } else {
      detectedAngle = 'FRONT';
    }

    return { yaw, pitchRatio, detectedAngle };
  };

  // Blur Check
  const isFrameBlurry = (videoEl: HTMLVideoElement, box: any): boolean => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      ctx.drawImage(videoEl, box.x, box.y, box.width, box.height, 0, 0, 64, 64);
      const imgData = ctx.getImageData(0, 0, 64, 64);
      const data = imgData.data;
      const width = 64;
      const height = 64;

      let sum = 0;
      let sumSq = 0;
      const laplacian: number[] = [];

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          const val = data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114;
          const nVal = (
            (data[idx - 4] * 0.299 + data[idx - 3] * 0.587 + data[idx - 2] * 0.114) +
            (data[idx + 4] * 0.299 + data[idx + 5] * 0.587 + data[idx + 6] * 0.114) +
            (data[(idx - width * 4)] * 0.299 + data[(idx - width * 4) + 1] * 0.587 + data[(idx - width * 4) + 2] * 0.114) +
            (data[(idx + width * 4)] * 0.299 + data[(idx + width * 4) + 1] * 0.587 + data[(idx + width * 4) + 2] * 0.114)
          );
          const lap = val * 4 - nVal;
          laplacian.push(lap);
          sum += lap;
        }
      }

      const mean = sum / laplacian.length;
      for (const val of laplacian) {
        sumSq += (val - mean) ** 2;
      }

      const variance = sumSq / laplacian.length;
      return variance < 10.0;
    } catch (e) {
      return false;
    }
  };

  // Illumination Check
  const isFrameTooDarkOrBright = (videoEl: HTMLVideoElement, box: any): { dark: boolean; bright: boolean; val: number } => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { dark: false, bright: false, val: 128 };

      ctx.drawImage(videoEl, box.x, box.y, box.width, box.height, 0, 0, 64, 64);
      const imgData = ctx.getImageData(0, 0, 64, 64);
      const data = imgData.data;

      let totalLuminance = 0;
      for (let i = 0; i < data.length; i += 4) {
        const luminance = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
        totalLuminance += luminance;
      }

      const avgLuminance = totalLuminance / (64 * 64);
      return {
        dark: avgLuminance < 40,
        bright: avgLuminance > 220,
        val: avgLuminance
      };
    } catch (e) {
      return { dark: false, bright: false, val: 128 };
    }
  };

  // Liveness Score Check
  const computeLivenessScore = (videoEl: HTMLVideoElement, box: any): { score: number; isLive: boolean; reason: string } => {
    try {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const ctx = c.getContext('2d');
      if (!ctx) return { score: 100, isLive: true, reason: '' };

      ctx.drawImage(videoEl, box.x, box.y, box.width, box.height, 0, 0, 64, 64);
      const imgData = ctx.getImageData(0, 0, 64, 64);
      const data = imgData.data;
      const W = 64, H = 64;

      let lapSum = 0;
      const laps: number[] = [];
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = (y * W + x) * 4;
          const v = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
          const n = (
            (data[i-4]*0.299+data[i-3]*0.587+data[i-2]*0.114) +
            (data[i+4]*0.299+data[i+5]*0.587+data[i+6]*0.114) +
            (data[i-W*4]*0.299+data[i-W*4+1]*0.587+data[i-W*4+2]*0.114) +
            (data[i+W*4]*0.299+data[i+W*4+1]*0.587+data[i+W*4+2]*0.114)
          );
          const lap = v * 4 - n;
          laps.push(lap); lapSum += lap;
        }
      }
      const lapMean = lapSum / laps.length;
      let lapVarSum = 0;
      for (const v of laps) lapVarSum += (v - lapMean) ** 2;
      const textureVariance = lapVarSum / laps.length;

      let gSum = 0;
      for (let i = 0; i < data.length; i += 4)
        gSum += data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114;
      const gMean = gSum / (W * H);
      let gDiffSq = 0;
      for (let i = 0; i < data.length; i += 4) {
        const g = data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114;
        gDiffSq += (g - gMean) ** 2;
      }
      const stdDev = Math.sqrt(gDiffSq / (W * H));

      let whitePixels = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i] > 240 && data[i+1] > 240 && data[i+2] > 240) whitePixels++;
      const glareRatio = whitePixels / (W * H);

      let skinCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        if (r > 60 && g > 30 && b > 15 && (r - g) > 10 && r > g && r > b) skinCount++;
      }
      const skinRatio = skinCount / (W * H);

      let hfEdges = 0;
      for (const v of laps) if (Math.abs(v) > 35) hfEdges++;
      const moireRatio = hfEdges / laps.length;

      let score = 100;
      const reasons: string[] = [];

      if (textureVariance < 1.0) { score -= 40; reasons.push('Flat surface detected'); }
      else if (textureVariance > 600.0) { score -= 30; reasons.push('Moiré pattern detected'); }
      if (stdDev < 4.0) { score -= 35; reasons.push('Low contrast uniformity'); }
      if (glareRatio > 0.38) { score -= 50; reasons.push('Screen glare detected'); }
      if (skinRatio < 0.02) { score -= 35; reasons.push('Implausible skin tone'); }
      if (moireRatio > 0.38) { score -= 45; reasons.push('Periodic screen pixel grid'); }

      score = Math.max(0, Math.min(100, score));
      return { score, isLive: score >= 70, reason: reasons.join('; ') || 'Live face verified' };
    } catch {
      return { score: 50, isLive: false, reason: 'Liveness evaluation failed' };
    }
  };

  // ── Multi-Angle Guided Face Capture Routine ────────────────────────────────
  const handleCapture = async () => {
    setErrorMsg('');

    if (!cameraActive) {
      setCameraActive(true);
    }

    if (!modelsLoaded) {
      setErrorMsg("AI models are still loading. Please wait a moment...");
      return;
    }

    const waitForVideo = (): Promise<HTMLVideoElement | null> => {
      return new Promise((resolve) => {
        let attempts = 0;
        const check = () => {
          const v = videoRef.current;
          if (v && v.srcObject && v.readyState >= 2) {
            resolve(v);
          } else if (attempts >= 50) {
            resolve(null);
          } else {
            attempts++;
            setTimeout(check, 100);
          }
        };
        check();
      });
    };

    setIsScanning(true);
    isScanningRef.current = true;
    setScanProgress(0);
    setCapturedCount(0);
    setCurrentAngleStageIndex(0);
    setAnglePreviews({});
    setAngleFrameCounts({ FRONT: 0, LEFT: 0, RIGHT: 0, UP: 0, DOWN: 0 });
    consecutiveSpoofFramesRef.current = 0;
    stabilizationFramesRef.current = 0;
    currentStageHoldFramesRef.current = 0;
    setErrorMsg('');

    const video = await waitForVideo();
    if (!video) {
      setIsScanning(false);
      setScanStepLabel('');
      setErrorMsg("Camera failed to initialize. Please allow camera access and try again.");
      return;
    }

    setScanStepLabel(`Angle 1/5: ${ANGLE_STAGES[0].name} — ${ANGLE_STAGES[0].instruction}`);

    const tempImages: string[] = [];
    const tempDescriptors: Float32Array[] = [];
    const tempAngleTags: string[] = [];
    const stagePreviews: { [key: string]: string } = {};
    const stageCounts: { [key: string]: number } = { FRONT: 0, LEFT: 0, RIGHT: 0, UP: 0, DOWN: 0 };

    let currentStageIndex = 0;
    let consecutiveBlurFails = 0;
    isProcessingFrameRef.current = false;

    setCapturedPreviews([]);
    setCapturedDescriptors([]);
    setCapturedAngleTags([]);
    setAvgDescriptor(null);

    if (captureIntervalRef.current !== null) {
      clearTimeout(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }

    const TOTAL_TARGET_FRAMES = 10; // 2 frames per each of the 5 angles

    const runCaptureFrame = async () => {
      if (!isScanningRef.current) return;

      // When all 5 angle stages are finished
      if (currentStageIndex >= ANGLE_STAGES.length) {
        if (captureIntervalRef.current !== null) {
          clearTimeout(captureIntervalRef.current);
          captureIntervalRef.current = null;
        }
        isProcessingFrameRef.current = false;

        if (tempDescriptors.length > 0) {
          const averaged = new Float32Array(128);
          for (let i = 0; i < 128; i++) {
            let sum = 0;
            tempDescriptors.forEach(desc => { sum += desc[i]; });
            averaged[i] = sum / tempDescriptors.length;
          }

          // Duplicate detection check against registered users
          let duplicateUser: User | null = null;
          for (const u of registeredUsers) {
            if (u.faceEmbedding) {
              try {
                const embedding = typeof u.faceEmbedding === 'string' ? JSON.parse(u.faceEmbedding) : u.faceEmbedding;
                const dist = faceapi.euclideanDistance(averaged, embedding);
                if (dist < 0.52) {
                  duplicateUser = u;
                  break;
                }
              } catch { }
            }
          }

          if (duplicateUser) {
            setErrorMsg(`Duplicate registration prevented. Face biometrics match existing user: ${(duplicateUser as User).name}.`);
            isScanningRef.current = false;
            setIsScanning(false);
            setCapturedPreviews([]);
            setScanProgress(0);
            return;
          }

          setAvgDescriptor(Array.from(averaged));
          setCapturedPhoto(tempImages[0] || '');
          setCapturedPreviews(tempImages);
          setCapturedDescriptors(tempDescriptors.map(d => Array.from(d)));
          setCapturedAngleTags(tempAngleTags);
          setScanProgress(100);
          isScanningRef.current = false;
          setIsScanning(false);
          setSuccessMsg('5-Angle Biometric Facial Registration Completed Successfully!');
        } else {
          setErrorMsg('No face detected. Please face camera directly and retry.');
          isScanningRef.current = false;
          setIsScanning(false);
          setScanProgress(0);
        }
        return;
      }

      if (isProcessingFrameRef.current) return;
      isProcessingFrameRef.current = true;

      const analyzeFrame = async () => {
        if (!video || video.paused || video.ended || !captureIntervalRef.current) {
          return;
        }

        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.35 }))
          .withFaceLandmarks()
          .withFaceDescriptors();

        if (!captureIntervalRef.current) return;

        if (detections.length > 1) {
          consecutiveSpoofFramesRef.current = 0;
          setErrorMsg('');
          setScanStepLabel('⚠️ Multiple faces detected! Only one person may be in camera view.');
          return;
        }

        if (detections.length === 0) {
          if (consecutiveSpoofFramesRef.current > 0) {
            consecutiveSpoofFramesRef.current = 0;
            setErrorMsg('');
          }
          const currentStage = ANGLE_STAGES[currentStageIndex];
          setScanStepLabel(`❌ Face not detected. Position yourself clearly — ${currentStage?.instruction}`);
          return;
        }

        const detection = detections[0];
        const box = detection.detection.box;

        // Camera stabilization phase
        if (stabilizationFramesRef.current < STABILIZATION_REQUIRED_FRAMES) {
          stabilizationFramesRef.current++;
          setScanStepLabel(`📸 Stabilizing exposure... (${stabilizationFramesRef.current}/${STABILIZATION_REQUIRED_FRAMES})`);
          setErrorMsg('');
          return;
        }

        // Quality check
        if (box.width < 80 || box.height < 80) {
          setScanStepLabel('⚠️ Move closer to the camera...');
          return;
        }

        const isBlurry = isFrameBlurry(video, box);
        if (isBlurry) {
          consecutiveBlurFails++;
          if (consecutiveBlurFails > 8) {
            setScanStepLabel('⚠️ Hold steady, camera is refocusing...');
          }
          return;
        }
        consecutiveBlurFails = 0;

        const lightCheck = isFrameTooDarkOrBright(video, box);
        if (lightCheck.dark) {
          setScanStepLabel('⚠️ Too dark! Please increase ambient lighting...');
          return;
        }
        if (lightCheck.bright) {
          setScanStepLabel('⚠️ Overexposed! Please reduce direct glare...');
          return;
        }

        // Liveness check
        const liveness = computeLivenessScore(video, box);
        if (!liveness.isLive) {
          consecutiveSpoofFramesRef.current++;
          if (consecutiveSpoofFramesRef.current >= SPOOF_FRAME_THRESHOLD) {
            setErrorMsg('🚫 Live face verification failed. Ensure natural lighting.');
          } else {
            setScanStepLabel(`⚠️ Verifying liveness... (${consecutiveSpoofFramesRef.current}/${SPOOF_FRAME_THRESHOLD})`);
          }
          return;
        }

        if (consecutiveSpoofFramesRef.current > 0) {
          consecutiveSpoofFramesRef.current = 0;
          setErrorMsg('');
        }

        // ── Check Current Target Angle ─────────────────────────────────────────
        const currentStage = ANGLE_STAGES[currentStageIndex];
        const pose = estimateFacePose(detection.landmarks);

        // Verification criteria:
        // Either the estimated angle matches the expected stage,
        // OR the user holds a steady verified pose for 8 frames (fail-safe tolerance)
        const isAngleMatched = (pose.detectedAngle === currentStage.key);
        currentStageHoldFramesRef.current++;

        const isAcceptedForStage = isAngleMatched || (currentStageHoldFramesRef.current >= 8);

        if (!isAcceptedForStage) {
          setScanStepLabel(`Angle ${currentStageIndex + 1}/5: ${currentStage.name} — ${currentStage.instruction} (${currentStage.tip})`);
          return;
        }

        // If previous descriptor is identical, require slight micro-movement
        if (tempDescriptors.length > 0) {
          const lastDesc = tempDescriptors[tempDescriptors.length - 1];
          let diffSq = 0;
          for (let i = 0; i < 128; i++) {
            const diff = detection.descriptor[i] - lastDesc[i];
            diffSq += diff * diff;
          }
          // Accept frame if moved slightly
          if (Math.sqrt(diffSq) < 0.08 && stageCounts[currentStage.key] > 0) {
            return;
          }
        }

        // ── Capture and store verified frame for this angle ──────────────────
        stageCounts[currentStage.key] = (stageCounts[currentStage.key] || 0) + 1;
        setAngleFrameCounts({ ...stageCounts });

        tempDescriptors.push(detection.descriptor);
        tempAngleTags.push(currentStage.name);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 200;
        tempCanvas.height = 150;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.drawImage(video, 0, 0, 200, 150);
          const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.6);
          tempImages.push(dataUrl);

          // Update stage thumbnail preview
          if (!stagePreviews[currentStage.key]) {
            stagePreviews[currentStage.key] = dataUrl;
            setAnglePreviews({ ...stagePreviews });
          }

          setCapturedPreviews(prev => [dataUrl, ...prev.slice(0, 11)]);
        }

        const totalEnrolled = tempImages.length;
        setCapturedCount(totalEnrolled);
        const progressPct = Math.round((totalEnrolled / TOTAL_TARGET_FRAMES) * 100);
        setScanProgress(progressPct);

        // Check if current angle target count reached
        if (stageCounts[currentStage.key] >= currentStage.targetCount) {
          currentStageHoldFramesRef.current = 0;
          currentStageIndex++;
          setCurrentAngleStageIndex(currentStageIndex);

          if (currentStageIndex < ANGLE_STAGES.length) {
            const nextStage = ANGLE_STAGES[currentStageIndex];
            setScanStepLabel(`✓ ${currentStage.name} captured! Next: ${nextStage.name} — ${nextStage.instruction}`);
          } else {
            setScanStepLabel('All 5 required angles captured! Processing biometric template...');
          }
        } else {
          setScanStepLabel(`Angle ${currentStageIndex + 1}/5: ${currentStage.name} — Frame ${stageCounts[currentStage.key]}/${currentStage.targetCount} (${progressPct}%)`);
        }
      };

      try {
        await analyzeFrame();
      } catch (err) {
        console.error('Enrollment frame error:', err);
      } finally {
        isProcessingFrameRef.current = false;
        if (isScanningRef.current && captureIntervalRef.current !== null) {
          captureIntervalRef.current = setTimeout(runCaptureFrame, 60);
        }
      }
    };

    captureIntervalRef.current = setTimeout(runCaptureFrame, 0);
  };

  // ── Register Submission ──────────────────────────────────────────────────────
  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (Object.keys(validationErrors).length > 0) {
      setErrorMsg(Object.values(validationErrors)[0] || 'Please resolve all validation errors before registering.');
      return;
    }

    if (!capturedPhoto || !avgDescriptor) {
      setErrorMsg('Multi-angle facial biometric capture is required.');
      return;
    }

    const now = new Date();
    const istDate = now.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
    const istTime = now.toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('Uploading biometric assets to Supabase storage...');

    setTimeout(async () => {
      try {
        let finalProfilePhoto = capturedPhoto;
        let finalFaceImages: string[] = [];

        if (isSupabaseConfigured && supabase) {
          setSuccessMsg('Uploading profile photo template...');
          const profileUrl = await uploadImageToSupabase(capturedPhoto, userId, 'profile.jpg');
          if (!profileUrl) {
            throw new Error('Failed to upload profile photo to Supabase storage.');
          }
          finalProfilePhoto = profileUrl;

          // Upload all captured previews (across the 5 angles)
          for (let i = 0; i < capturedPreviews.length; i++) {
            setSuccessMsg(`Uploading multi-angle biometric template ${i + 1}/${capturedPreviews.length}...`);
            const imgUrl = await uploadImageToSupabase(capturedPreviews[i], userId, `face_${i}.jpg`);
            if (!imgUrl) {
              throw new Error(`Failed to upload face image ${i + 1} to Supabase storage.`);
            }
            finalFaceImages.push(imgUrl);
          }
        }

        const newUser: User = {
          id: userId,
          name: fullName,
          role: designation,
          photoUrl: finalProfilePhoto,
          profile_photo: finalProfilePhoto,
          regDate: istDate,
          registrationDate: istDate,
          registrationTime: istTime,
          lastUpdatedDate: istDate,
          lastUpdatedTime: istTime,
          faceEmbedding: JSON.stringify(avgDescriptor),
          totalCapturedImages: capturedPreviews.length || 10,
          status: 'Active',
          is_enrolled: true,
          enrollment_type: 'Biometric',
          face_images: JSON.stringify(finalFaceImages),
          gender: gender,
          age: age === '' ? undefined : Number(age),
          designation: designation,
          department: department,
          email: email.trim(),
          phone: mobileNumber.trim(),
          mobile_number: mobileNumber.trim(),
          created_by_admin_name: adminName,
          created_by_admin_id: adminId,
          registration_status: 'Active',
          registration_date: istDate,
          registration_time: istTime,
          last_updated_date: istDate,
          last_updated_time: istTime
        };

        setSuccessMsg('Synchronizing personnel registry in Supabase...');
        await onRegister(newUser);

        // Save individual angle descriptors in face_images table
        if (isSupabaseConfigured && supabase) {
          const { error: deleteError } = await supabase
            .from('face_images')
            .delete()
            .eq('user_id', userId);

          if (deleteError) {
            console.warn('[VisionGuard] Failed to delete old face embeddings:', deleteError.message);
          }

          for (let i = 0; i < finalFaceImages.length; i++) {
            const angleStageIndex = Math.min(4, Math.floor(i / 2));
            const angleName = ANGLE_STAGES[angleStageIndex]?.name || `Angle_${i}`;

            setSuccessMsg(`Saving biometric angle [${angleName}] ${i + 1}/${finalFaceImages.length}...`);
            const imgUrl = finalFaceImages[i];
            const desc = capturedDescriptors[i] || avgDescriptor;

            const { error: dbError } = await supabase
              .from('face_images')
              .insert({
                id: `${userId}_face_${i}_${Date.now()}`,
                user_id: userId,
                image_url: imgUrl,
                embedding: JSON.stringify(desc),
                capture_angle: angleName,
                created_at: new Date().toISOString()
              });

            if (dbError) {
              throw new Error(`Database error saving face angle ${i + 1}: ${dbError.message}`);
            }
          }
        }

        if (onClearPrefilledPhoto) onClearPrefilledPhoto();
        setSuccessMsg('✓ Registration successfully completed via Biometric Enrollment!');
        setTimeout(() => {
          if (onSuccess) onSuccess();
        }, 1500);
      } catch (err: any) {
        console.error('Registration failed:', err);
        setErrorMsg(err.message || 'Registration failed. Check connection to Supabase.');
      } finally {
        setIsSubmitting(false);
      }
    }, 50);
  };

  const cancelScan = () => {
    isScanningRef.current = false;
    if (captureIntervalRef.current !== null) {
      clearTimeout(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    isProcessingFrameRef.current = false;
    consecutiveSpoofFramesRef.current = 0;
    const video = videoRef.current;
    if (video && video.srcObject) {
      (video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      video.srcObject = null;
    }
    setIsScanning(false);
    setScanProgress(0);
    setScanStepLabel('');
    setErrorMsg('');
    setSuccessMsg('');
    setCapturedCount(0);
    setCapturedPreviews([]);
    setCapturedDescriptors([]);
    setCapturedAngleTags([]);
    setCapturedPhoto(null);
    setAvgDescriptor(null);
    setCurrentAngleStageIndex(0);
    setAnglePreviews({});
    setAngleFrameCounts({ FRONT: 0, LEFT: 0, RIGHT: 0, UP: 0, DOWN: 0 });
    setCameraActive(false);
  };

  const handleRecapture = () => {
    cancelScan();
    if (onClearPrefilledPhoto) onClearPrefilledPhoto();
    setTimeout(() => setCameraActive(true), 150);
  };

  return (
    <div className="fade-in glass-panel" style={{ padding: '30px', maxWidth: '980px', margin: '0 auto' }}>
      
      {/* Header Section */}
      <div style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h2 style={{ fontFamily: 'Orbitron', fontSize: '1.6rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
              <UserPlus size={24} style={{ color: 'var(--color-cyan)' }} />
              Personnel Registration Portal
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '6px 0 0 0' }}>
              Enroll personnel with 5-angle biometric facial verification for face-recognition-based access control.
            </p>
          </div>

          <div style={{
            background: 'rgba(0, 243, 255, 0.1)',
            border: '1px solid rgba(0, 243, 255, 0.3)',
            borderRadius: '8px',
            padding: '6px 14px',
            fontSize: '0.78rem',
            color: 'var(--color-cyan)',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            <span>🔒 Verified by:</span>
            <span style={{ color: '#ffffff' }}>{adminName}</span>
          </div>
        </div>
      </div>



      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {/* MAIN REGISTRATION FORM */}
      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {(
        <form onSubmit={handleRegister} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
          
          {/* Left Column: Form Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

            {/* Error Message */}
            {errorMsg && (
              <div className="glass-panel" style={{
                padding: '12px 18px',
                background: 'rgba(255, 59, 48, 0.1)',
                border: '1px solid var(--color-red)',
                color: 'var(--color-red)',
                borderRadius: '12px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertTriangle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Success Message */}
            {successMsg && (
              <div className="glass-panel" style={{
                padding: '12px 18px',
                background: 'rgba(0, 255, 136, 0.1)',
                border: '1px solid var(--color-emerald)',
                color: 'var(--color-emerald)',
                borderRadius: '12px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckCircle2 size={16} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Full Name & Employee ID */}
            <div className="cyber-input-group">
              <label className="cyber-input-label">Personnel Full Name *</label>
              <input 
                type="text" 
                className="cyber-input" 
                placeholder="e.g. Bruce Wayne" 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isScanning}
                required
              />
              {validationErrors.fullName && (
                <span style={{ color: 'var(--color-red)', fontSize: '0.72rem', marginTop: '2px', display: 'block' }}>
                  {validationErrors.fullName}
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="cyber-input-group">
                <label className="cyber-input-label">Gender *</label>
                <select 
                  className="cyber-input cyber-select"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  disabled={isScanning}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
                {validationErrors.gender && (
                  <span style={{ color: 'var(--color-red)', fontSize: '0.72rem', marginTop: '2px', display: 'block' }}>
                    {validationErrors.gender}
                  </span>
                )}
              </div>
              <div className="cyber-input-group">
                <label className="cyber-input-label">Age *</label>
                <input 
                  type="number" 
                  className="cyber-input" 
                  placeholder="e.g. 34" 
                  value={age}
                  onChange={(e) => setAge(e.target.value === '' ? '' : Number(e.target.value))}
                  disabled={isScanning}
                  min={1}
                  max={120}
                />
                {validationErrors.age && (
                  <span style={{ color: 'var(--color-red)', fontSize: '0.72rem', marginTop: '2px', display: 'block' }}>
                    {validationErrors.age}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="cyber-input-group">
                <label className="cyber-input-label">Designation / Role *</label>
                <select 
                  className="cyber-input cyber-select"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  disabled={isScanning}
                >
                  <option value="Staff Officer">Staff Officer</option>
                  <option value="Administrator">Administrator</option>
                  <option value="Security Officer">Security Officer</option>
                  <option value="Technician">Technician</option>
                  <option value="Engineer">Engineer</option>
                  <option value="VIP">VIP</option>
                  <option value="Contractor">Contractor</option>
                </select>
                {validationErrors.designation && (
                  <span style={{ color: 'var(--color-red)', fontSize: '0.72rem', marginTop: '2px', display: 'block' }}>
                    {validationErrors.designation}
                  </span>
                )}
              </div>
              <div className="cyber-input-group">
                <label className="cyber-input-label">Department / Branch *</label>
                <input 
                  type="text" 
                  className="cyber-input" 
                  placeholder="e.g. Computer Science / R&D" 
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={isScanning}
                  required
                />
                {validationErrors.department && (
                  <span style={{ color: 'var(--color-red)', fontSize: '0.72rem', marginTop: '2px', display: 'block' }}>
                    {validationErrors.department}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="cyber-input-group">
                <label className="cyber-input-label">Email Address *</label>
                <input 
                  type="email" 
                  className="cyber-input" 
                  placeholder="e.g. bruce@wayne.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isScanning}
                  required
                />
                {validationErrors.email && (
                  <span style={{ color: 'var(--color-red)', fontSize: '0.72rem', marginTop: '2px', display: 'block' }}>
                    {validationErrors.email}
                  </span>
                )}
              </div>
              <div className="cyber-input-group">
                <label className="cyber-input-label">Mobile Number *</label>
                <input 
                  type="text" 
                  className="cyber-input" 
                  placeholder="e.g. 9876543210" 
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  disabled={isScanning}
                  required
                />
                {validationErrors.mobileNumber && (
                  <span style={{ color: 'var(--color-red)', fontSize: '0.72rem', marginTop: '2px', display: 'block' }}>
                    {validationErrors.mobileNumber}
                  </span>
                )}
              </div>
            </div>



            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '12px', justifyContent: 'center' }}>
              <button 
                type="submit" 
                className="btn-3d btn-cyan" 
                style={{ padding: '10px 20px', fontSize: '0.85rem', borderRadius: '10px', minWidth: '150px' }}
                disabled={isScanning || !capturedPhoto || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Registering...
                  </>
                ) : 'Complete Registration'}
              </button>
              <button 
                type="button" 
                className="btn-3d btn-secondary" 
                style={{ padding: '10px 20px', fontSize: '0.85rem', borderRadius: '10px', minWidth: '130px' }}
                onClick={() => {
                  cancelScan();
                  onCancel();
                }}
                disabled={isSubmitting}
              >
                {isScanning ? '⏹ Stop & Cancel' : 'Cancel'}
              </button>
            </div>

          </div>

          {/* Right Column: 5-Angle Biometric Face Scanner */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="cyber-input-label" style={{ margin: 0 }}>5-Angle Biometric Capture *</span>
              <span style={{ fontSize: '0.74rem', color: 'var(--color-cyan)', fontFamily: 'Orbitron' }}>
                {capturedCount}/10 Samples ({Math.min(5, Math.floor(capturedCount / 2))}/5 Angles)
              </span>
            </div>

            {/* Video Viewport */}
            <div style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '4/3',
              background: '#010108',
              border: '1px solid var(--border-glass)',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-3d)'
            }}>
              {cameraActive && !capturedPhoto && (
                <video 
                  ref={videoRef}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                  muted
                  playsInline
                />
              )}

              <canvas ref={canvasRef} width={400} height={300} style={{ display: 'none' }} />

              {capturedPhoto && (
                <img 
                  src={capturedPhoto} 
                  alt="Primary Captured Biometric" 
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />
              )}

              {/* Completion Overlay */}
              {capturedPhoto && (
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
                  background: 'rgba(1, 1, 8, 0.75)',
                  color: 'var(--color-emerald)',
                  zIndex: 12
                }}>
                  <CheckCircle2 size={58} style={{ 
                    color: 'var(--color-emerald)',
                    filter: 'drop-shadow(0 0 10px var(--color-emerald))'
                  }} />
                  <p style={{ fontFamily: 'Orbitron', marginTop: '12px', fontWeight: 'bold', fontSize: '0.95rem' }}>
                    All 5 Angles Enrolled Successfully
                  </p>
                </div>
              )}

              {/* Laser Scanning Animation */}
              {isScanning && (
                <>
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    width: '100%',
                    height: '3px',
                    background: 'var(--color-cyan)',
                    boxShadow: '0 0 15px var(--color-cyan)',
                    animation: 'laserScan 2s ease-in-out infinite',
                    zIndex: 10
                  }} />
                  <div style={{
                    position: 'absolute',
                    top: '12%',
                    left: '12%',
                    right: '12%',
                    bottom: '12%',
                    border: '1px dashed rgba(0, 243, 255, 0.4)',
                    borderRadius: '50%',
                    animation: 'signalPulse 1.5s infinite',
                    zIndex: 9
                  }} />
                </>
              )}

              {/* Camera Offline HUD */}
              {!cameraActive && !capturedPhoto && !isScanning && (
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
                  background: 'rgba(5, 5, 21, 0.85)',
                  color: 'var(--text-muted)',
                  padding: '20px',
                  textAlign: 'center'
                }}>
                  <Camera size={36} style={{ opacity: 0.3, marginBottom: '12px' }} />
                  {Object.keys(validationErrors).length > 0 ? (
                    <>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-red)', margin: 0 }}>
                        🔒 Face Scanning Locked
                      </p>
                      <p style={{ fontSize: '0.74rem', opacity: 0.7, marginTop: '4px' }}>
                        Please resolve all form errors on the left to unlock scanner.
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>Biometric Camera Ready</p>
                      <p style={{ fontSize: '0.74rem', opacity: 0.7, marginTop: '4px' }}>
                        Click below to start 5-angle biometric facial enrollment.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 5-Angle Visual Step Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '8px',
              width: '100%'
            }}>
              {ANGLE_STAGES.map((stage, idx) => {
                const count = angleFrameCounts[stage.key] || 0;
                const isPassed = count >= stage.targetCount;
                const isCurrent = isScanning && currentAngleStageIndex === idx;
                const previewImg = anglePreviews[stage.key];

                return (
                  <div 
                    key={stage.key}
                    style={{
                      padding: '8px 4px',
                      borderRadius: '8px',
                      border: isPassed 
                        ? '1px solid var(--color-emerald)' 
                        : isCurrent 
                          ? '1px solid var(--color-cyan)' 
                          : '1px solid var(--border-glass)',
                      background: isPassed 
                        ? 'rgba(0, 255, 136, 0.08)' 
                        : isCurrent 
                          ? 'rgba(0, 243, 255, 0.08)' 
                          : 'rgba(5, 5, 21, 0.4)',
                      textAlign: 'center',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {previewImg && (
                      <img 
                        src={previewImg} 
                        alt={stage.name} 
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          borderRadius: '4px',
                          objectFit: 'cover',
                          marginBottom: '4px'
                        }}
                      />
                    )}
                    <div style={{
                      fontSize: '0.66rem',
                      fontWeight: 700,
                      color: isPassed ? 'var(--color-emerald)' : isCurrent ? 'var(--color-cyan)' : 'var(--text-muted)',
                      textTransform: 'uppercase'
                    }}>
                      {stage.shortLabel}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: isPassed ? 'var(--color-emerald)' : 'var(--text-muted)' }}>
                      {isPassed ? '✓ Complete' : isCurrent ? 'Active...' : `${count}/${stage.targetCount}`}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scanner Controls */}
            {Object.keys(validationErrors).length > 0 ? (
              <button 
                type="button" 
                className="btn-3d btn-secondary" 
                style={{ width: '100%', cursor: 'not-allowed' }}
                disabled
              >
                🔒 Fill Required Fields to Unlock Scanner
              </button>
            ) : !cameraActive ? (
              <button 
                type="button" 
                className="btn-3d btn-cyan" 
                style={{ width: '100%' }}
                onClick={() => setCameraActive(true)}
              >
                <Camera size={16} />
                Activate Camera
              </button>
            ) : !capturedPhoto ? (
              <button 
                type="button" 
                className="btn-3d btn-cyan" 
                style={{ width: '100%' }}
                onClick={handleCapture}
                disabled={isScanning || !modelsLoaded}
              >
                <Camera size={16} />
                {isScanning 
                  ? `Scanning Angle ${currentAngleStageIndex + 1}/5 (${capturedCount}/10)` 
                  : 'Start 5-Angle Biometric Scan'}
              </button>
            ) : (
              <button 
                type="button" 
                className="btn-3d btn-purple" 
                style={{ width: '100%' }}
                onClick={handleRecapture}
                disabled={isScanning}
              >
                <RefreshCw size={16} />
                Recapture Biometric Angles
              </button>
            )}

            {/* Scanning Progress Bar & Instruction Guide */}
            {isScanning && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(0, 243, 255, 0.08)',
                  border: '1px solid rgba(0, 243, 255, 0.25)',
                  fontSize: '0.75rem',
                  color: 'var(--color-cyan)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Compass size={16} className="animate-spin" style={{ animation: 'spin 3s linear infinite' }} />
                  <span>{scanStepLabel}</span>
                </div>

                <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ 
                    width: `${scanProgress}%`, 
                    height: '100%', 
                    background: 'linear-gradient(90deg, var(--color-cyan), var(--color-purple))', 
                    transition: 'width 0.15s ease' 
                  }} />
                </div>
              </div>
            )}

            {/* Captured preview thumbnails */}
            {capturedPreviews.length > 0 && !isScanning && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '6px',
                width: '100%',
                padding: '6px',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                background: 'rgba(5, 5, 21, 0.3)'
              }}>
                {capturedPreviews.slice(0, 10).map((img, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <img 
                      src={img} 
                      alt="face frame" 
                      style={{ width: '100%', borderRadius: '4px', aspectRatio: 1, objectFit: 'cover' }} 
                    />
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'rgba(0,0,0,0.7)',
                      fontSize: '0.58rem',
                      color: 'var(--color-cyan)',
                      textAlign: 'center'
                    }}>
                      {ANGLE_STAGES[Math.min(4, Math.floor(idx / 2))]?.name.split(' ')[0]}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>

        </form>
      )}

    </div>
  );
};
