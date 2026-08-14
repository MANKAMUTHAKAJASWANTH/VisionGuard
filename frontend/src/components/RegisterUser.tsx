import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  UserPlus, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw,
  Info
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
  // ── CRITICAL: Store interval ID in a ref so cancelScan() can clear it from anywhere ──
  const captureIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref mirror of isScanning — avoids stale closure reads inside recursive setTimeout
  const isScanningRef = useRef(false);

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

  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStepLabel, setScanStepLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      errors.department = 'Department is required.';
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


  // Enrollment arrays
  const [capturedCount, setCapturedCount] = useState(0);
  const [capturedPreviews, setCapturedPreviews] = useState<string[]>([]);
  const [capturedDescriptors, setCapturedDescriptors] = useState<number[][]>([]);
  const [avgDescriptor, setAvgDescriptor] = useState<number[] | null>(null);

  const isProcessingFrameRef = useRef(false);
  const consecutiveSpoofFramesRef = useRef(0);
  const SPOOF_FRAME_THRESHOLD = 12; // Consecutive failures needed for warning
  const stabilizationFramesRef = useRef(0);
  const STABILIZATION_REQUIRED_FRAMES = 3; // Minimal stabilization — just 3 frames

  // Auto-generate standard ID
  useEffect(() => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setUserId(`VG-${randomNum}`);
  }, []);

  // Prefill photo from warning alerts if present
  useEffect(() => {
    if (prefilledPhoto) {
      setCapturedPhoto(prefilledPhoto);
      setSuccessMsg("Extracting face signature from pre-loaded template...");
      
      const img = new Image();
      img.src = prefilledPhoto;
      img.onload = async () => {
        try {
          // If models are not loaded yet, fallback to a default zero array,
          // but we prioritize extraction if models are available.
          if (typeof faceapi !== 'undefined' && faceapi.nets?.tinyFaceDetector?.params) {
            const detection = await faceapi
              .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.35 }))
              .withFaceLandmarks()
              .withFaceDescriptor();
            
            if (detection) {
              setAvgDescriptor(Array.from(detection.descriptor));
              setCapturedDescriptors([Array.from(detection.descriptor)]);
              setCapturedPreviews([prefilledPhoto]);
              setSuccessMsg("Face signature extracted successfully!");
            } else {
              setAvgDescriptor(new Array(128).fill(0.0));
              setErrorMsg("No face detected in pre-loaded snapshot. Please adjust or recapture biometrics if matching fails.");
            }
          } else {
            setAvgDescriptor(new Array(128).fill(0.0));
            setSuccessMsg("Snapshot loaded. Face signature will use fallback matching.");
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
      
      // Temporary fetch interceptor for model weights
      (window as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        
        if (url.includes('/models/')) {
          const filename = url.substring(url.lastIndexOf('/') + 1);
          try {
            const cache = await caches.open(cacheName);
            const cachedResponse = await cache.match(filename);
            
            if (cachedResponse) {
              console.log(`[VisionGuard AI Cache] Loaded ${filename} from browser cache`);
              return cachedResponse;
            }
            
            // Try fetching from local public folder
            try {
              const localResponse = await originalFetch(input, init);
              if (localResponse.ok) {
                await cache.put(filename, localResponse.clone());
                console.log(`[VisionGuard AI Cache] Cached local model: ${filename}`);
                return localResponse;
              }
            } catch (localErr) {
              console.log(`[VisionGuard AI Cache] Local fetch failed for ${filename}, trying CDN fallback...`);
            }
            
            // CDN Fallback download - use same CDN as index.html script tag
            const cdnUrl = `https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights/${filename}`;

            const cdnResponse = await originalFetch(cdnUrl, init);
            if (cdnResponse.ok) {
              await cache.put(filename, cdnResponse.clone());
              console.log(`[VisionGuard AI Cache] Retrieved and cached from CDN: ${filename}`);
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
        window.fetch = originalFetch; // Restore fetch
      }
    };
    loadModels();
  }, []);

  // Web Camera Stream for enrollment - starts as soon as camera is activated
  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    
    if (cameraActive && videoRef.current) {
      // Reset all biometric and liveness state to start with a completely fresh session state
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

  // Real-time Face Capture Scanning
  const handleCapture = async () => {
    setErrorMsg('');

    // Auto-start camera if not already active
    if (!cameraActive) {
      setCameraActive(true);
    }

    // Wait for models to load
    if (!modelsLoaded) {
      setErrorMsg("AI models are still loading. Please wait a moment...");
      return;
    }

    // Wait for camera video stream to be ready (up to 5 seconds)
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

    // Helper function to calculate Laplacian variance for blur check
    const isFrameBlurry = (videoEl: HTMLVideoElement, box: any): boolean => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;

        // Draw cropped face region to 64x64 canvas
        ctx.drawImage(
          videoEl,
          box.x, box.y, box.width, box.height,
          0, 0, 64, 64
        );

        const imgData = ctx.getImageData(0, 0, 64, 64);
        const data = imgData.data;
        const width = 64;
        const height = 64;

        // Compute Laplacian variance
        let sum = 0;
        let sumSq = 0;
        const laplacian: number[] = [];

        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            // Grayscale value of current pixel
            const val = data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114;

            // Neighbors (4-neighborhood Laplacian filter)
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
        console.log(`[Biometric Quality] Face score check. Blur score variance: ${variance.toFixed(2)}`);
        // If variance is below 10.0, the image is blurry
        return variance < 10.0;
      } catch (e) {
        return false;
      }
    };

    // Helper function to check if the face is too dark or bright
    const isFrameTooDarkOrBright = (videoEl: HTMLVideoElement, box: any): { dark: boolean; bright: boolean; val: number } => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return { dark: false, bright: false, val: 128 };

        ctx.drawImage(
          videoEl,
          box.x, box.y, box.width, box.height,
          0, 0, 64, 64
        );

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

    // ─── LIVENESS / ANTI-SPOOF ENGINE (used during enrollment scanning) ───────
    // Computes a 0–100 liveness score for a cropped face region.
    // Returns isLive=true only when score ≥ 70.
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

        // 1. Texture variance (Laplacian)
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

        // 2. Brightness uniformity (std-dev of grayscale)
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

        // 3. Specular glare (very bright near-white pixels → screen backlight)
        let whitePixels = 0;
        for (let i = 0; i < data.length; i += 4)
          if (data[i] > 240 && data[i+1] > 240 && data[i+2] > 240) whitePixels++;
        const glareRatio = whitePixels / (W * H);

        // 4. Skin-tone plausibility
        let skinCount = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2];
          if (r > 60 && g > 30 && b > 15 && (r - g) > 10 && r > g && r > b) skinCount++;
        }
        const skinRatio = skinCount / (W * H);

        // 5. Moiré / high-frequency grid (screen pixel pattern)
        let hfEdges = 0;
        for (const v of laps) if (Math.abs(v) > 35) hfEdges++;
        const moireRatio = hfEdges / laps.length;

        let score = 100;
        const reasons: string[] = [];

        if (textureVariance < 1.0) { score -= 40; reasons.push('Flat surface/paper (low texture variance)'); }
        else if (textureVariance > 600.0) { score -= 30; reasons.push('Extreme texture variance (moiré pattern)'); }
        if (stdDev < 4.0) { score -= 35; reasons.push('Low contrast uniformity (backlit surface / photo)'); }
        if (glareRatio > 0.38) { score -= 50; reasons.push('High specular glare (specular reflection detected)'); }
        if (skinRatio < 0.02) { score -= 35; reasons.push('Implausible skin spectrum (spectral color bias)'); }
        if (moireRatio > 0.38) { score -= 45; reasons.push('Periodic pixel grid (printed photo attack)'); }

        score = Math.max(0, Math.min(100, score));
        return { score, isLive: score >= 70, reason: reasons.join('; ') || 'Liveness signals verified' };
      } catch {
        return { score: 50, isLive: false, reason: 'Liveness evaluation failed' };
      }
    };
    // ──────────────────────────────────────────────────────────────────────────

    setScanStepLabel('Starting camera...');
    setIsScanning(true);
    isScanningRef.current = true; // Sync ref immediately — state update is async, ref is synchronous
    setScanProgress(0);
    setCapturedCount(0);
    // Always reset spoof and stabilization counters on scan start/restart
    consecutiveSpoofFramesRef.current = 0;
    stabilizationFramesRef.current = 0;
    setErrorMsg('');

    const video = await waitForVideo();
    if (!video) {
      setIsScanning(false);
      setScanStepLabel('');
      setErrorMsg("Camera failed to initialize. Please allow camera access and try again.");
      return;
    }

    setScanStepLabel('👤 Front View: Look straight at camera...');

    const tempImages: string[] = [];
    const tempDescriptors: Float32Array[] = [];

    const TARGET_FRAMES = 10; // exactly 10 high-quality unique frames
    let framesEnrolled = 0;
    let consecutiveBlurFails = 0;
    isProcessingFrameRef.current = false;
    // Reset spoof and stabilization counters when starting a fresh interval
    consecutiveSpoofFramesRef.current = 0;
    stabilizationFramesRef.current = 0;

    // Reset components previews
    setCapturedPreviews([]);
    setCapturedDescriptors([]);
    setAvgDescriptor(null);

    // Kill any previous timeout before starting a new one
    if (captureIntervalRef.current !== null) {
      clearTimeout(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    isProcessingFrameRef.current = false;
    // Sync the ref so the recursive closure reads the correct live value
    isScanningRef.current = true;

    // Recursive frame capture routine — uses isScanningRef (NOT isScanning state)
    // to avoid the stale-closure bug where isScanning always reads the initial false value.
    const runCaptureFrame = async () => {
      if (!isScanningRef.current) return;

      if (framesEnrolled >= TARGET_FRAMES) {
        if (captureIntervalRef.current !== null) {
          clearTimeout(captureIntervalRef.current);
          captureIntervalRef.current = null;
        }
        isProcessingFrameRef.current = false;

        // Complete registration logic
        if (tempDescriptors.length > 0) {
          const averaged = new Float32Array(128);
          for (let i = 0; i < 128; i++) {
            let sum = 0;
            tempDescriptors.forEach(desc => { sum += desc[i]; });
            averaged[i] = sum / tempDescriptors.length;
          }

          // Duplicate detection check
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
            setErrorMsg(`Duplicate registration prevented. Face matches existing user: ${(duplicateUser as User).name}.`);
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
          setScanProgress(100);
          isScanningRef.current = false;
          setIsScanning(false);
          setSuccessMsg('Face Registration Completed Successfully');
        } else {
          setErrorMsg('No face detected in scan. Please face the camera directly and retry.');
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

        // Run detection — evaluate every frame independently
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.35 }))
          .withFaceLandmarks()
          .withFaceDescriptors();

        if (!captureIntervalRef.current) return;

        // ── MULTIPLE FACES: pause accumulation, keep scanning ─────────────────
        if (detections.length > 1) {
          consecutiveSpoofFramesRef.current = 0;
          setErrorMsg('');
          setScanStepLabel('⚠️ MULTIPLE PERSONS DETECTED — Only one person can register at a time. Please remove extra persons from view...');
          return;
        }

        // ── NO FACE: clear spoof warning immediately, wait ────────────────────
        if (detections.length === 0) {
          if (consecutiveSpoofFramesRef.current > 0) {
            consecutiveSpoofFramesRef.current = 0;
            setErrorMsg('');
          }
          setScanStepLabel('❌ Face not detected. Position yourself clearly in front of camera...');
          return;
        }

        const detection = detections[0];
        const box = detection.detection.box;

        // Skip duplicate frames if the face has not moved or changed at all
        if (tempDescriptors.length > 0) {
          const lastDesc = tempDescriptors[tempDescriptors.length - 1];
          let sum = 0;
          for (let i = 0; i < 128; i++) {
            const diff = detection.descriptor[i] - lastDesc[i];
            sum += diff * diff;
          }
          const dist = Math.sqrt(sum);
          // Threshold 0.10: accept any frame where the person moved at least slightly.
          // 0.05 was too strict — natural micro-movements (breathing, sway) were rejected.
          if (dist < 0.10) {
            return;
          }
        }

        // ── STABILIZATION PHASE ────────────────────────────────────────────────
        if (stabilizationFramesRef.current < STABILIZATION_REQUIRED_FRAMES) {
          stabilizationFramesRef.current++;
          setScanStepLabel(`📸 Stabilizing camera exposure and focus... (${stabilizationFramesRef.current}/${STABILIZATION_REQUIRED_FRAMES})`);
          setErrorMsg('');
          return;
        }

        // ── FACE QUALITY CHECK ─────────────────────────────────────────────────
        if (box.width < 80 || box.height < 80) {
          setScanStepLabel('⚠️ Quality Alert: Move closer to the camera...');
          return;
        }

        const isBlurry = isFrameBlurry(video, box);
        if (isBlurry) {
          consecutiveBlurFails++;
          if (consecutiveBlurFails > 8) {
            setScanStepLabel('⚠️ Quality Alert: Hold still, frame is blurry...');
          }
          return;
        }
        consecutiveBlurFails = 0;

        const lightCheck = isFrameTooDarkOrBright(video, box);
        if (lightCheck.dark) {
          setScanStepLabel('⚠️ Quality Alert: Too dark! Adjust illumination...');
          return;
        }
        if (lightCheck.bright) {
          setScanStepLabel('⚠️ Quality Alert: Overexposed! Adjust lighting...');
          return;
        }

        // ── LIVENESS / ANTI-SPOOF CHECK ──────────────────────────────────────
        const liveness = computeLivenessScore(video, box);

        console.log(`[VisionGuard Registration Debug]`, {
          faceDetected: 'YES',
          faceQualityScore: 'HIGH (Pass)',
          livenessScore: liveness.score,
          antiSpoofScore: liveness.score,
          recognitionConfidence: 'N/A',
          failureReason: liveness.isLive ? 'None' : liveness.reason
        });

        if (!liveness.isLive) {
          if (liveness.score >= 50 && liveness.score < 70) {
            consecutiveSpoofFramesRef.current++;
            const promptIndex = Math.floor(consecutiveSpoofFramesRef.current / 4) % 3;
            const prompts = [
              "⚠️ Liveness borderline. Please blink naturally...",
              "⚠️ Liveness borderline. Please turn your head slightly left...",
              "⚠️ Liveness borderline. Please turn your head slightly right..."
            ];
            setScanStepLabel(prompts[promptIndex]);
            if (consecutiveSpoofFramesRef.current >= 18) {
              setErrorMsg('🚫 Registration Failed - Live Face Verification Failed.');
            }
          } else {
            consecutiveSpoofFramesRef.current++;
            if (consecutiveSpoofFramesRef.current >= SPOOF_FRAME_THRESHOLD) {
              setScanStepLabel('');
              setErrorMsg('🚫 Registration Failed - Live Face Verification Failed.');
            } else {
              setScanStepLabel(`⚠️ Verifying liveness... (${consecutiveSpoofFramesRef.current}/${SPOOF_FRAME_THRESHOLD})`);
              setErrorMsg('');
            }
          }
          return;
        }

        if (consecutiveSpoofFramesRef.current > 0) {
          consecutiveSpoofFramesRef.current = 0;
          setErrorMsg('');
        }

        consecutiveBlurFails = 0;
        framesEnrolled++;

        const displayCount = Math.min(TARGET_FRAMES, framesEnrolled);
        setCapturedCount(displayCount);
        const progressPct = Math.round((displayCount / TARGET_FRAMES) * 100);
        setScanProgress(progressPct);

        let guidance = '';
        if (displayCount <= 3) {
          guidance = '👤 Front View: Look straight at camera...';
        } else if (displayCount <= 7) {
          guidance = '👤 Profile View: Turn head slightly Left...';
        } else {
          guidance = '👤 Profile View: Turn head slightly Right...';
        }

        setScanStepLabel(`Capturing Face Samples — ${displayCount} / ${TARGET_FRAMES} (${progressPct}%) — ${guidance}`);

        tempDescriptors.push(detection.descriptor);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 200;
        tempCanvas.height = 150;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.drawImage(video, 0, 0, 200, 150);
          const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.5);
          tempImages.push(dataUrl);
          setCapturedPreviews(prev => [dataUrl, ...prev.slice(0, 11)]);
        }
      };

      try {
        await analyzeFrame();
      } catch (err) {
        console.error('Enrollment frame error:', err);
      } finally {
        isProcessingFrameRef.current = false;
        // CRITICAL: Always reschedule so the completion block at the top of
        // runCaptureFrame can execute after the 12th frame is captured.
        // The framesEnrolled >= TARGET_FRAMES check inside runCaptureFrame stops the loop.
        // Previously this condition included `framesEnrolled < TARGET_FRAMES` which
        // blocked the final completion call — registration would hang after 12 captures.
        if (isScanningRef.current && captureIntervalRef.current !== null) {
          captureIntervalRef.current = setTimeout(runCaptureFrame, 0);
        }
      }
    };

    // ── CRITICAL: Start the recursive loop immediately ──
    captureIntervalRef.current = setTimeout(runCaptureFrame, 0);
  };



  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (Object.keys(validationErrors).length > 0) {
      setErrorMsg(Object.values(validationErrors)[0] || 'Please resolve all validation errors before registering.');
      return;
    }

    if (!capturedPhoto || !avgDescriptor) {
      setErrorMsg('Facial biometric capture is required.');
      return;
    }

    // Get IST timestamp
    const now = new Date();
    const istDate = now.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
    const istTime = now.toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('Uploading biometric assets to cloud gateway...');

    setTimeout(async () => {
      try {
        let finalProfilePhoto = capturedPhoto;
        let finalFaceImages: string[] = [];

        if (isSupabaseConfigured && supabase) {
          // Upload profile photo
          setSuccessMsg('Uploading profile photo template...');
          const profileUrl = await uploadImageToSupabase(capturedPhoto, userId, 'profile.jpg');
          if (!profileUrl) {
            throw new Error('Failed to upload profile photo to Supabase storage.');
          }
          finalProfilePhoto = profileUrl;

          // Upload all captured previews (up to 40 frames) to Supabase Storage first
          for (let i = 0; i < capturedPreviews.length; i++) {
            setSuccessMsg(`Uploading face signature template ${i + 1}/${capturedPreviews.length}...`);
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
          totalCapturedImages: capturedPreviews.length || 12,
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

        // 1. Call onRegister first to create the registered_user record (satisfying Foreign Key)
        setSuccessMsg('Synchronizing profile registry...');
        await onRegister(newUser);

        // 2. Now that the user exists in database, save the individual embeddings in face_images table
        if (isSupabaseConfigured && supabase) {
          // Replace old embeddings for this user ID instead of mixing old and new descriptors
          const { error: deleteError } = await supabase
            .from('face_images')
            .delete()
            .eq('user_id', userId);

          if (deleteError) {
            console.warn('[VisionGuard] Failed to delete old face embeddings (non-fatal):', deleteError.message);
          }

          for (let i = 0; i < finalFaceImages.length; i++) {
            setSuccessMsg(`Saving face signature index ${i + 1}/${finalFaceImages.length}...`);
            const imgUrl = finalFaceImages[i];
            const desc = capturedDescriptors[i] || avgDescriptor;

            const { error: dbError } = await supabase
              .from('face_images')
              .insert({
                id: `${userId}_face_${i}_${Date.now()}`,
                user_id: userId,
                image_url: imgUrl,
                embedding: JSON.stringify(desc),
                capture_angle: `Angle_${i}`,
                created_at: new Date().toISOString()
              });

            if (dbError) {
              throw new Error(`Database error saving face signature ${i + 1}: ${dbError.message}`);
            }
          }
        }

        if (onClearPrefilledPhoto) onClearPrefilledPhoto();
        setSuccessMsg('Enrollment successfully completed!');
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


  // ── cancelScan: THE canonical cleanup function ─────────────────────────────
  // Stops the capture interval, releases the camera stream, and resets ALL
  // scan state. Must be called before navigating away or restarting a scan.
  const cancelScan = () => {
    // 1. Stop the recursive loop FIRST via ref (avoids stale-closure continuation)
    isScanningRef.current = false;
    // 2. Kill any pending timeout
    if (captureIntervalRef.current !== null) {
      clearTimeout(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    // 3. Release the frame lock so future scans can start
    isProcessingFrameRef.current = false;
    // 4. Reset ALL spoof state
    consecutiveSpoofFramesRef.current = 0;
    // 4. Stop the camera stream tracks directly
    const video = videoRef.current;
    if (video && video.srcObject) {
      (video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      video.srcObject = null;
    }
    // 5. Reset all scan / enrollment state
    setIsScanning(false);
    setScanProgress(0);
    setScanStepLabel('');
    setErrorMsg('');
    setSuccessMsg('');
    setCapturedCount(0);
    setCapturedPreviews([]);
    setCapturedDescriptors([]);
    setCapturedPhoto(null);
    setAvgDescriptor(null);
    // 6. Turn camera off at App level so no other component holds the stream
    setCameraActive(false);
  };

  const handleRecapture = () => {
    // Cancel any in-progress scan first, then restart camera
    cancelScan();
    if (onClearPrefilledPhoto) onClearPrefilledPhoto();
    // Small delay to let the camera stream fully release before re-opening
    setTimeout(() => setCameraActive(true), 150);
  };



  return (
    <div className="fade-in glass-panel" style={{ padding: '30px', maxWidth: '900px', margin: '0 auto' }}>
      
      {/* Page Title */}
      <div style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '20px', marginBottom: '28px' }}>
        <h2 style={{ fontFamily: 'Orbitron', fontSize: '1.6rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <UserPlus size={24} style={{ color: 'var(--color-cyan)' }} />
          Authorized User Enrollment
        </h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '6px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
            Register authorized users for face recognition-based access control to restricted areas.
          </p>
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

      <form onSubmit={handleRegister} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        
        {/* Left Column: Form Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
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
              <label className="cyber-input-label">Designation *</label>
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
              <label className="cyber-input-label">Department *</label>
              <input 
                type="text" 
                className="cyber-input" 
                placeholder="e.g. R&D" 
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                disabled={isScanning}
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

          <div className="cyber-input-group">
            <label className="cyber-input-label">Employee ID / User ID *</label>
            <input 
              type="text" 
              className="cyber-input" 
              placeholder="e.g. VG-4829" 
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={isScanning}
            />
            {validationErrors.userId && (
              <span style={{ color: 'var(--color-red)', fontSize: '0.72rem', marginTop: '2px', display: 'block' }}>
                {validationErrors.userId}
              </span>
            )}
          </div>

          <div style={{
            padding: '16px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border-glass)',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            display: 'flex',
            gap: '10px'
          }}>
            <Info size={24} style={{ color: 'var(--color-cyan)', flexShrink: 0 }} />
            <p style={{ lineHeight: '1.4' }}>
              Facial features are processed locally. Multi-angle scanning compiles 10 photos to train the recognition vector descriptor.
            </p>
          </div>

          {/* Form Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px', justifyContent: 'center' }}>
            <button 
              type="submit" 
              className="btn-3d btn-cyan" 
              style={{ padding: '8px 18px', fontSize: '0.82rem', borderRadius: '10px', minWidth: '130px' }}
              disabled={isScanning || !capturedPhoto || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="animate-spin" size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Registering...
                </>
              ) : 'Register Node'}
            </button>
            <button 
              type="button" 
              className="btn-3d btn-secondary" 
              style={{ padding: '8px 18px', fontSize: '0.82rem', borderRadius: '10px', minWidth: '130px' }}
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

        {/* Right Column: Biometric Camera Enroll Capture */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
          
          <span className="cyber-input-label" style={{ alignSelf: 'flex-start' }}>Biometric Scanner Capture</span>
          
          {/* Webcam Viewport Frame */}
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
            {/* Real Video Stream */}
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

            {/* Hidden Canvas */}
            <canvas ref={canvasRef} width={400} height={300} style={{ display: 'none' }} />

            {/* Captured Photo Preview */}
            {capturedPhoto && (
              <img 
                src={capturedPhoto} 
                alt="Captured Face" 
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

            {successMsg && (successMsg.includes('Completed') || successMsg.includes('successful')) && (
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
                background: 'rgba(1, 1, 8, 0.85)',
                color: 'var(--color-emerald)',
                zIndex: 12,
                animation: 'fadeIn 0.3s ease'
              }}>
                <CheckCircle2 size={64} style={{ 
                  animation: 'signalPulse 1.5s infinite',
                  color: 'var(--color-emerald)',
                  filter: 'drop-shadow(0 0 10px var(--color-emerald))'
                }} />
                <p style={{ fontFamily: 'Orbitron', marginTop: '16px', fontWeight: 'bold', fontSize: '1rem' }}>
                  {successMsg}
                </p>
              </div>
            )}

            {/* Scan Laser Scan Effect */}
            {isScanning && (
              <>
                <div style={{
                  position: 'absolute',
                  left: 0,
                  width: '100%',
                  height: '4px',
                  background: 'var(--color-cyan)',
                  boxShadow: '0 0 15px var(--color-cyan)',
                  animation: 'laserScan 2s ease-in-out infinite',
                  zIndex: 10
                }} />
                <div style={{
                  position: 'absolute',
                  top: '10%',
                  left: '10%',
                  right: '10%',
                  bottom: '10%',
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
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-red)' }}>🔒 Face scanning locked</p>
                    <p style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '4px' }}>
                      Please correct all form validation errors on the left to unlock scanning.
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Biometric camera linked: standby</p>
                    <p style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '4px' }}>
                      Click below to activate camera and start biometric capture.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Capture Trigger Button */}
          {Object.keys(validationErrors).length > 0 ? (
            <button 
              type="button" 
              className="btn-3d btn-secondary" 
              style={{ width: '100%', cursor: 'not-allowed' }}
              disabled
            >
              🔒 Complete Fields to Unlock Scanner
            </button>
          ) : !cameraActive ? (
            <button 
              type="button" 
              className="btn-3d btn-cyan" 
              style={{ width: '100%' }}
              onClick={() => setCameraActive(true)}
            >
              <Camera size={18} />
              Initialize Biometric Scanner
            </button>
          ) : !capturedPhoto ? (
            <button 
              type="button" 
              className="btn-3d btn-cyan" 
              style={{ width: '100%' }}
              onClick={handleCapture}
              disabled={isScanning || !modelsLoaded}
            >
              <Camera size={18} />
              {isScanning ? `Extracting descriptors (${capturedCount}/12)` : 'Start 12-Frame Biometric Scan'}
            </button>
          ) : (
            <button 
              type="button" 
              className="btn-3d btn-purple" 
              style={{ width: '100%' }}
              onClick={handleRecapture}
              disabled={isScanning}
            >
              <RefreshCw size={18} />
              Recapture Biometric Template
            </button>
          )}

          {/* Scanning Progress Bar */}
          {isScanning && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--color-cyan)', fontFamily: 'Orbitron' }}>
                <span>{scanStepLabel}</span>
                <span>{scanProgress}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${scanProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-cyan), var(--color-purple))', transition: 'width 0.1s ease' }} />
              </div>
            </div>
          )}

          {/* Image swatches preview */}
          {capturedPreviews.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '6px',
              maxHeight: '80px',
              overflowY: 'auto',
              width: '100%',
              padding: '6px',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px'
            }}>
              {capturedPreviews.map((img, idx) => (
                <img key={idx} src={img} alt="scan slice" style={{ width: '100%', borderRadius: '4px', aspectRatio: 1, objectFit: 'cover' }} />
              ))}
            </div>
          )}

        </div>

      </form>
    </div>
  );
};
