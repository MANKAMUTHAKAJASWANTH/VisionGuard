import React, { useState, useRef, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Trash2, 
  Edit3, 
  ShieldAlert,
  UserCheck,
  X,
  Save,
  Camera,
  RefreshCw,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';

import type { User } from '../services/api';
import { uploadImageToSupabase, isSupabaseConfigured, supabase } from '../services/supabase';

const faceapi = (window as any).faceapi;

interface RegisteredUsersProps {
  users: User[];
  onDeleteUser: (id: string) => void;
  onEditUser: (user: User) => void;
}

export const RegisteredUsers: React.FC<RegisteredUsersProps> = ({
  users,
  onDeleteUser,
  onEditUser
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const formatLastSeen = (timestamp?: string) => {
    if (!timestamp) return 'Never seen';
    try {
      const d = new Date(timestamp);
      return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return timestamp;
    }
  };
  
  // Edit Form States
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState('Male');
  const [editAge, setEditAge] = useState<number | ''>('');
  const [editDesignation, setEditDesignation] = useState('Staff Officer');
  const [editDepartment, setEditDepartment] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editMobileNumber, setEditMobileNumber] = useState('');
  
  // Recapture Camera states
  const [cameraActive, setCameraActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [capturedCount, setCapturedCount] = useState(0);
  const [scanStepLabel, setScanStepLabel] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedPreviews, setCapturedPreviews] = useState<string[]>([]);
  const [capturedDescriptors, setCapturedDescriptors] = useState<number[][]>([]);
  const [avgDescriptor, setAvgDescriptor] = useState<number[] | null>(null);
  const [recaptureError, setRecaptureError] = useState('');
  const [recaptureSuccess, setRecaptureSuccess] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filtering users based on search (Name, Employee ID, Email, Mobile Number)
  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    const phoneVal = (u.phone || u.mobile_number || '').toLowerCase();
    const emailVal = (u.email || '').toLowerCase();
    return (
      u.name.toLowerCase().includes(term) ||
      u.id.toLowerCase().includes(term) ||
      emailVal.includes(term) ||
      phoneVal.includes(term)
    );
  });

  // Helper to color designations
  const getBadgeClass = (designation: string) => {
    switch (designation?.toLowerCase()) {
      case 'administrator': return 'btn-purple';
      case 'security officer': return 'btn-red';
      case 'technician': return 'btn-cyan';
      case 'engineer': return 'btn-cyan';
      default: return 'btn-secondary';
    }
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditGender(user.gender || 'Male');
    setEditAge(user.age ?? '');
    setEditDesignation(user.designation || user.role || 'Staff Officer');
    setEditDepartment(user.department || '');
    setEditEmail(user.email || '');
    setEditMobileNumber(user.phone || user.mobile_number || '');
    
    // Reset camera recapture states
    setCameraActive(false);
    setIsScanning(false);
    setScanProgress(0);
    setCapturedCount(0);
    setScanStepLabel('');
    setCapturedPhoto(null);
    setCapturedPreviews([]);
    setCapturedDescriptors([]);
    setAvgDescriptor(null);
    setRecaptureError('');
    setRecaptureSuccess('');
  };

  const closeEditModal = () => {
    setEditingUser(null);
    stopCamera();
  };

  const stopCamera = () => {
    if (captureIntervalRef.current !== null) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    const video = videoRef.current;
    if (video && video.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      video.srcObject = null;
    }
    setCameraActive(false);
    setIsScanning(false);
    setScanProgress(0);
    setScanStepLabel('');
  };

  // Web Camera Stream for recapturing
  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;

    const startStream = async () => {
      if (cameraActive && editingUser && !capturedPhoto) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' },
            audio: false
          });
          if (active && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.log('Video play error:', e));
          }
        } catch (err) {
          console.error('Camera stream access failed:', err);
          setRecaptureError('Unable to access camera. Please verify permissions.');
          setCameraActive(false);
        }
      }
    };

    startStream();

    return () => {
      active = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraActive, capturedPhoto]);

  // Frame blur check using Laplacian variance helper
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

      let sum = 0, sumSq = 0;
      const laplacian: number[] = [];

      for (let y = 1; y < 63; y++) {
        for (let x = 1; x < 63; x++) {
          const idx = (y * 64 + x) * 4;
          const val = data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114;

          const nVal = (
            (data[idx - 4] * 0.299 + data[idx - 3] * 0.587 + data[idx - 2] * 0.114) +
            (data[idx + 4] * 0.299 + data[idx + 5] * 0.587 + data[idx + 6] * 0.114) +
            (data[(idx - 64 * 4)] * 0.299 + data[(idx - 64 * 4) + 1] * 0.587 + data[(idx - 64 * 4) + 2] * 0.114) +
            (data[(idx + 64 * 4)] * 0.299 + data[(idx + 64 * 4) + 1] * 0.587 + data[(idx + 64 * 4) + 2] * 0.114)
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

  const handleRecaptureScan = async () => {
    if (!editingUser) return;
    setRecaptureError('');
    setRecaptureSuccess('');
    setCapturedPhoto(null);
    setCapturedPreviews([]);
    setCapturedDescriptors([]);
    setAvgDescriptor(null);
    setScanProgress(0);
    setCapturedCount(0);
    setCameraActive(true);

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

    setScanStepLabel('Connecting camera...');
    setIsScanning(true);

    const video = await waitForVideo();
    if (!video) {
      setIsScanning(false);
      setScanStepLabel('');
      setRecaptureError("Camera failed to initialize.");
      return;
    }

    setScanStepLabel('👤 Front View: Look straight at camera...');

    const tempImages: string[] = [];
    const tempDescriptors: Float32Array[] = [];
    const TARGET_FRAMES = 50;
    let framesEnrolled = 0;
    let consecutiveBlurFails = 0;

    if (captureIntervalRef.current !== null) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }

    captureIntervalRef.current = setInterval(async () => {
      if (framesEnrolled >= TARGET_FRAMES) {
        if (captureIntervalRef.current !== null) {
          clearInterval(captureIntervalRef.current);
          captureIntervalRef.current = null;
        }
        stopCamera();

        if (tempDescriptors.length > 0) {
          const averaged = new Float32Array(128);
          for (let i = 0; i < 128; i++) {
            let sum = 0;
            tempDescriptors.forEach(desc => { sum += desc[i]; });
            averaged[i] = sum / tempDescriptors.length;
          }

          setAvgDescriptor(Array.from(averaged));
          setCapturedPhoto(tempImages[0] || '');
          setCapturedPreviews(tempImages);
          setCapturedDescriptors(tempDescriptors.map(d => Array.from(d)));
          setScanProgress(100);
          setIsScanning(false);
          setScanStepLabel('');
          setRecaptureSuccess(`Face signatures captured successfully! (${tempDescriptors.length} angles mapped)`);
        } else {
          setRecaptureError('No face detected. Face the camera directly and try again.');
          setIsScanning(false);
          setScanProgress(0);
          setScanStepLabel('');
        }
        return;
      }

      try {
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.55 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          const isBlurry = isFrameBlurry(video, detection.detection.box);
          if (isBlurry) {
            consecutiveBlurFails++;
            if (consecutiveBlurFails > 5) {
              setScanStepLabel('⚠️ Quality Alert: Hold still, frame is blurry...');
            }
            return;
          }

          // Perform light level checks (too dark or bright)
          const lightCheck = isFrameTooDarkOrBright(video, detection.detection.box);
          if (lightCheck.dark) {
            setScanStepLabel('⚠️ Quality Alert: Too dark! Adjust illumination...');
            return; // Skip dark frame
          }
          if (lightCheck.bright) {
            setScanStepLabel('⚠️ Quality Alert: Overexposed! Adjust lighting...');
            return; // Skip bright frame
          }

          consecutiveBlurFails = 0;
          framesEnrolled++;
          setCapturedCount(framesEnrolled);
          setScanProgress(Math.round((framesEnrolled / TARGET_FRAMES) * 100));

          // Set active guidance label based on target frames (50 frames total)
          if (framesEnrolled <= 8) {
            setScanStepLabel('👤 Front View: Look straight at camera...');
          } else if (framesEnrolled <= 16) {
            setScanStepLabel('👤 Profile View: Turn head slightly Left...');
          } else if (framesEnrolled <= 24) {
            setScanStepLabel('👤 Profile View: Turn head slightly Right...');
          } else if (framesEnrolled <= 32) {
            setScanStepLabel('👤 Profile View: Tilt head slightly Up...');
          } else if (framesEnrolled <= 40) {
            setScanStepLabel('👤 Profile View: Tilt head slightly Down...');
          } else {
            setScanStepLabel('👤 Final View: Slowly rotate head...');
          }

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
        } else {
          setScanStepLabel('❌ Face not detected. Position yourself clearly in front of camera...');
        }
      } catch (err) {
        console.error('Frame extraction failed:', err);
      }
    }, 180);
  };

  const handleSaveEdit = async () => {
    const currentEditingUser = editingUser;
    if (!currentEditingUser || !editName.trim()) return;
    setSaving(true);
    setRecaptureError('');
    setRecaptureSuccess('');

    // Validations
    if (!editEmail.trim()) {
      setRecaptureError('Email Address is required.');
      setSaving(false);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editEmail.trim())) {
      setRecaptureError('Please enter a valid email address.');
      setSaving(false);
      return;
    }
    // Check Email uniqueness (excluding the user currently being edited)
    if (users.some(u => u.id !== currentEditingUser.id && u.email && u.email.toLowerCase() === editEmail.trim().toLowerCase())) {
      setRecaptureError('Email Address must be unique. This email is already registered.');
      setSaving(false);
      return;
    }
    if (!editMobileNumber.trim()) {
      setRecaptureError('Mobile Number is required.');
      setSaving(false);
      return;
    }
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(editMobileNumber.trim())) {
      setRecaptureError('Mobile Number must contain exactly 10 digits.');
      setSaving(false);
      return;
    }
    // Check Mobile Number uniqueness
    if (users.some(u => u.id !== currentEditingUser.id && (u.phone || u.mobile_number)?.replace(/\D/g, '') === editMobileNumber.trim())) {
      setRecaptureError('Mobile Number must be unique. This number is already registered.');
      setSaving(false);
      return;
    }

    try {
      let finalProfilePhoto = currentEditingUser.photoUrl;
      let finalFaceImages = currentEditingUser.face_images ? JSON.parse(currentEditingUser.face_images) : [];
      let finalEmbedding = currentEditingUser.faceEmbedding;

      // If user recaptured facial biometrics, upload templates to Storage
      if (capturedPhoto && avgDescriptor) {
        if (isSupabaseConfigured && supabase) {
          // Delete old assets
          const { data: files } = await supabase.storage.from('face-images').list(currentEditingUser.id);
          if (files && files.length > 0) {
            const paths = files.map(f => `${currentEditingUser.id}/${f.name}`);
            await supabase.storage.from('face-images').remove(paths);
          }

          // Upload profile photo
          setRecaptureSuccess('Uploading updated profile template...');
          const profileUrl = await uploadImageToSupabase(capturedPhoto, currentEditingUser.id, 'profile.jpg');
          if (!profileUrl) throw new Error('Profile template upload failed.');
          finalProfilePhoto = profileUrl;

          // Upload new angles templates
          const imgUrls: string[] = [];
          for (let i = 0; i < capturedPreviews.length; i++) {
            setRecaptureSuccess(`Uploading face signature template ${i + 1}/${capturedPreviews.length}...`);
            const url = await uploadImageToSupabase(capturedPreviews[i], currentEditingUser.id, `face_${i}.jpg`);
            if (!url) throw new Error(`Face signature upload failed at index ${i + 1}`);
            imgUrls.push(url);
          }
          finalFaceImages = imgUrls;
          finalEmbedding = JSON.stringify(avgDescriptor);

          // Update face_images table: Delete old entries
          await supabase.from('face_images').delete().eq('user_id', currentEditingUser.id);

          // Insert new face_images entries
          for (let i = 0; i < finalFaceImages.length; i++) {
            const desc = capturedDescriptors[i] || avgDescriptor;
            await supabase.from('face_images').insert({
              id: `${currentEditingUser.id}_face_${i}_${Date.now()}`,
              user_id: currentEditingUser.id,
              image_url: finalFaceImages[i],
              embedding: JSON.stringify(desc),
              capture_angle: `Angle_${i}`,
              created_at: new Date().toISOString()
            });
          }
        }
      }

      const now = new Date();
      const istDate = now.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
      const istTime = now.toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });

      const updatedUser: User = {
        ...currentEditingUser,
        name: editName.trim(),
        role: editDesignation,
        photoUrl: finalProfilePhoto,
        profile_photo: finalProfilePhoto,
        gender: editGender,
        age: editAge === '' ? undefined : Number(editAge),
        designation: editDesignation,
        department: editDepartment || undefined,
        email: editEmail.trim(),
        phone: editMobileNumber.trim(),
        mobile_number: editMobileNumber.trim(),
        faceEmbedding: finalEmbedding,
        face_images: JSON.stringify(finalFaceImages),
        totalCapturedImages: capturedPreviews.length > 0 ? capturedPreviews.length : currentEditingUser.totalCapturedImages,
        lastUpdatedDate: istDate,
        lastUpdatedTime: istTime,
        last_updated_date: istDate,
        last_updated_time: istTime
      };

      await onEditUser(updatedUser);
      closeEditModal();
    } catch (err: any) {
      console.error('Edit update failed:', err);
      setRecaptureError(err.message || 'Failed to update personnel profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = (id: string) => {
    setConfirmDeleteId(id);
  };

  const handleDeleteConfirmed = () => {
    if (confirmDeleteId) {
      onDeleteUser(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Search Header row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap',
        borderBottom: '1px solid var(--border-glass)',
        paddingBottom: '20px'
      }}>
        <div>
          <h2 style={{ fontFamily: 'Orbitron', fontSize: '1.6rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={24} style={{ color: 'var(--color-cyan)' }} />
            Authorized Personnel Registry
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '4px' }}>
            Manage authorized personnel profiles linked to face recognition-based access control.
          </p>
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', width: '300px' }}>
          <input
            type="text"
            className="cyber-input"
            placeholder="Search name, ID, designation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '44px' }}
          />
          <Search size={18} style={{
            position: 'absolute',
            left: '16px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)'
          }} />
        </div>
      </div>

      {/* Grid List */}
      {users.length === 0 ? (
        <div className="glass-panel" style={{
          textAlign: 'center', padding: '60px 20px',
          color: 'var(--text-muted)', display: 'flex',
          flexDirection: 'column', alignItems: 'center', gap: '12px'
        }}>
          <ShieldAlert size={48} style={{ opacity: 0.3 }} />
          <p style={{ fontWeight: 600, fontSize: '1.1rem' }}>No registered users yet.</p>
          <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
            Use the Authorized User Enrollment portal to register new personnel for access control.
          </p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="glass-panel" style={{
          textAlign: 'center', padding: '60px 20px',
          color: 'var(--text-muted)', display: 'flex',
          flexDirection: 'column', alignItems: 'center', gap: '12px'
        }}>
          <ShieldAlert size={48} style={{ opacity: 0.3 }} />
          <p style={{ fontWeight: 600, fontSize: '1.1rem' }}>No Registered Nodes Found</p>
          <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
            No matching personnel profiles found in database. Try a different query.
          </p>
        </div>
      ) : (
        <div className="users-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className="glass-panel glass-panel-hover"
              style={{
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.01) 0%, rgba(10, 10, 26, 0.75) 100%)'
              }}
            >
              {/* Profile Avatar Frame with glow */}
              <div style={{ position: 'relative', marginBottom: '16px' }}>
                <img
                  src={user.photoUrl}
                  alt={user.name}
                  style={{
                    width: '100px', height: '100px',
                    borderRadius: '50%',
                    border: '3px solid rgba(0, 243, 255, 0.25)',
                    boxShadow: '0 0 20px rgba(0, 243, 255, 0.15)',
                    objectFit: 'cover'
                  }}
                />
                <div style={{
                  position: 'absolute', bottom: '2px', right: '2px',
                  background: 'var(--color-emerald)',
                  border: '2px solid var(--bg-deep)',
                  width: '16px', height: '16px',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 8px var(--color-emerald)'
                }}>
                  <UserCheck size={8} style={{ color: '#ffffff' }} />
                </div>
              </div>

              {/* Identity details */}
              <h4 style={{ fontSize: '1.15rem', color: '#ffffff', fontWeight: 700, marginBottom: '4px' }}>
                {user.name}
              </h4>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', marginBottom: '8px', display: 'block' }}>
                ID: {user.id}
              </span>

              {/* Designation pill */}
              <span className={`cyber-badge ${getBadgeClass(user.designation || user.role || 'Staff Officer')}`} style={{
                fontSize: '0.65rem',
                marginBottom: '16px',
                padding: '4px 12px',
                color: '#ffffff',
                border: 'none'
              }}>
                {user.designation || user.role || 'Staff Officer'}
              </span>

              {/* Extended Biometrics Info */}
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', textAlign: 'left', borderTop: '1px solid var(--border-glass)', paddingTop: '12px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Gender:</span>
                  <span style={{ color: '#ffffff', fontWeight: 600 }}>{user.gender || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Age:</span>
                  <span style={{ color: '#ffffff', fontWeight: 600 }}>{user.age ?? 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Department:</span>
                  <span style={{ color: '#ffffff', fontWeight: 600 }}>{user.department || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Email:</span>
                  <span style={{ color: '#ffffff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }} title={user.email}>{user.email || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Mobile Number:</span>
                  <span style={{ color: '#ffffff', fontWeight: 600 }}>{user.phone || user.mobile_number || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                  <span style={{ color: 'var(--color-emerald)', fontWeight: 700 }}>{user.status || 'Active'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Last Seen:</span>
                  <span style={{ color: 'var(--color-cyan)', fontWeight: 600 }}>{formatLastSeen(user.last_recognized_at)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', borderTop: '1px dashed rgba(255,255,255,0.05)', paddingTop: '6px', marginTop: '4px' }}>
                  <span>Created:</span>
                  <span>{user.registration_date || user.registrationDate || user.regDate} {user.registration_time || user.registrationTime || ''}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <span>Updated:</span>
                  <span>{user.last_updated_date || user.lastUpdatedDate || 'N/A'} {user.last_updated_time || user.lastUpdatedTime || ''}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--color-cyan)', fontWeight: 600, marginTop: '2px' }}>
                  <span>Templates Captured:</span>
                  <span>{user.totalCapturedImages || 40} frames</span>
                </div>
              </div>

              {/* Card Actions */}
              <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: 'auto' }}>
                <button
                  className="btn-3d btn-secondary"
                  style={{ flex: 1, padding: '8px', fontSize: '0.8rem', gap: '6px' }}
                  onClick={() => openEditModal(user)}
                >
                  <Edit3 size={12} />
                  Edit
                </button>
                <button
                  className="btn-3d btn-red"
                  style={{ flex: 1, padding: '8px', fontSize: '0.8rem', gap: '6px' }}
                  onClick={() => handleConfirmDelete(user.id)}
                >
                  <Trash2 size={12} />
                  Revoke
                </button>
              </div>

              {/* Custom visual bottom accent */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0,
                width: '100%', height: '4px',
                background: (user.designation || user.role) === 'Administrator' ? 'var(--color-purple)' : (user.designation || user.role) === 'Security Officer' ? 'var(--color-red)' : 'var(--color-cyan)'
              }} />
            </div>
          ))}
        </div>
      )}

      {/* ── Inline Edit Modal with Scanner Wizard ────────────────────────────────── */}
      {editingUser && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(5, 5, 21, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 3000, padding: '20px', overflowY: 'auto'
        }}>
          <div className="glass-panel fade-in" style={{
            width: '100%', maxWidth: cameraActive ? '720px' : '480px', padding: '32px',
            border: '2px solid rgba(0, 243, 255, 0.35)',
            boxShadow: '0 0 40px rgba(0, 102, 255, 0.3)',
            transition: 'max-width 0.3s ease-in-out'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: 'Orbitron', color: '#ffffff', fontSize: '1.1rem' }}>
                ✏️ Edit Personnel Record
              </h3>
              <button
                className="btn-3d btn-secondary"
                style={{ padding: '6px 10px' }}
                onClick={closeEditModal}
              >
                <X size={16} />
              </button>
            </div>

            {/* Error & Success Messages */}
            {recaptureError && (
              <div className="glass-panel" style={{ padding: '10px 16px', background: 'rgba(255, 59, 48, 0.1)', border: '1px solid var(--color-red)', color: 'var(--color-red)', borderRadius: '10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <AlertTriangle size={14} />
                <span>{recaptureError}</span>
              </div>
            )}
            {recaptureSuccess && (
              <div className="glass-panel" style={{ padding: '10px 16px', background: 'rgba(0, 255, 136, 0.1)', border: '1px solid var(--color-emerald)', color: 'var(--color-emerald)', borderRadius: '10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <CheckCircle2 size={14} />
                <span>{recaptureSuccess}</span>
              </div>
            )}

            {/* Sub-view: Two columns if camera active, else single */}
            <div style={{ display: 'grid', gridTemplateColumns: cameraActive ? '1fr 1.2fr' : '1fr', gap: '24px' }}>
              
              {/* Form Side */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Full Name *</label>
                  <input
                    type="text"
                    className="cyber-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Personnel name..."
                    disabled={isScanning || saving}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Gender</label>
                    <select
                      className="cyber-input"
                      value={editGender}
                      onChange={(e) => setEditGender(e.target.value)}
                      disabled={isScanning || saving}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Age</label>
                    <input
                      type="number"
                      className="cyber-input"
                      value={editAge}
                      onChange={(e) => setEditAge(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Age"
                      disabled={isScanning || saving}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Designation</label>
                    <select
                      className="cyber-input"
                      value={editDesignation}
                      onChange={(e) => setEditDesignation(e.target.value)}
                      disabled={isScanning || saving}
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
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Department</label>
                    <input
                      type="text"
                      className="cyber-input"
                      value={editDepartment}
                      onChange={(e) => setEditDepartment(e.target.value)}
                      placeholder="Department"
                      disabled={isScanning || saving}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Email Address *</label>
                    <input
                      type="email"
                      className="cyber-input"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="Email Address"
                      disabled={isScanning || saving}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Mobile Number *</label>
                    <input
                      type="text"
                      className="cyber-input"
                      value={editMobileNumber}
                      onChange={(e) => setEditMobileNumber(e.target.value)}
                      placeholder="10-digit mobile number"
                      disabled={isScanning || saving}
                      required
                    />
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '12px', marginTop: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Facial Biometric Template</label>
                  {!cameraActive ? (
                    <button
                      type="button"
                      className="btn-3d btn-secondary"
                      style={{ width: '100%', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px' }}
                      onClick={() => setCameraActive(true)}
                      disabled={saving}
                    >
                      <Camera size={14} />
                      Recapture Facial Signatures
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-3d btn-red"
                      style={{ width: '100%', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px' }}
                      onClick={stopCamera}
                      disabled={saving}
                    >
                      <X size={14} />
                      {isScanning ? '⏹ Stop & Cancel Scan' : 'Cancel Camera Scan'}
                    </button>
                  )}
                </div>
              </div>

              {/* Camera Scanner Side */}
              {cameraActive && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
                  <div style={{
                    width: '100%',
                    height: '220px',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    position: 'relative',
                    background: '#040410',
                    border: '1.5px solid var(--border-glass)'
                  }}>
                    {/* Video elements */}
                    {!capturedPhoto && (
                      <video
                        ref={videoRef}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        muted
                        playsInline
                      />
                    )}
                    <canvas ref={canvasRef} style={{ display: 'none' }} width={400} height={300} />

                    {/* Previews/Photo */}
                    {capturedPhoto && (
                      <img
                        src={capturedPhoto}
                        alt="Recaptured Face"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )}

                    {/* Scan effect overlays */}
                    {isScanning && (
                      <>
                        <div style={{
                          position: 'absolute', left: 0, width: '100%', height: '4px',
                          background: 'var(--color-cyan)', boxShadow: '0 0 15px var(--color-cyan)',
                          animation: 'laserScan 2s ease-in-out infinite', zIndex: 10
                        }} />
                        <div style={{
                          position: 'absolute', top: '10%', left: '10%', right: '10%', bottom: '10%',
                          border: '1px dashed rgba(0, 243, 255, 0.4)', borderRadius: '50%',
                          animation: 'signalPulse 1.5s infinite', zIndex: 9
                        }} />
                      </>
                    )}

                    {/* Scanner HUD labels */}
                    {isScanning && (
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--color-cyan)', zIndex: 11, fontSize: '0.8rem', fontWeight: 'bold'
                      }}>
                        <RefreshCw className="animate-spin" size={24} style={{ animation: 'spin 1.5s linear infinite', marginBottom: '8px' }} />
                        <span>{scanStepLabel || 'Scanning face...'}</span>
                        <span style={{ fontSize: '0.75rem', marginTop: '4px', color: '#ffffff' }}>({capturedCount}/40 frames)</span>
                      </div>
                    )}
                  </div>

                  {/* Wizard controls */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-3d btn-cyan"
                      style={{ padding: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      onClick={handleRecaptureScan}
                      disabled={isScanning}
                    >
                      <RefreshCw size={12} />
                      Start 40-Frame Biometric Scan
                    </button>
                    {scanProgress > 0 && scanProgress < 100 && (
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${scanProgress}%`, height: '100%', background: 'var(--color-cyan)', transition: 'width 0.1s ease' }} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer action bar */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', borderTop: '1px solid var(--border-glass)', paddingTop: '20px' }}>
              <button
                className="btn-3d btn-secondary"
                style={{ flex: 1, padding: '12px' }}
                onClick={closeEditModal}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn-3d btn-cyan"
                style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                onClick={handleSaveEdit}
                disabled={saving || isScanning || !editName.trim()}
              >
                <Save size={14} />
                {saving ? 'Synchronizing...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Modal ─────────────────────────────── */}
      {confirmDeleteId && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(5, 5, 21, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 3000, padding: '20px'
        }}>
          <div className="glass-panel fade-in" style={{
            width: '100%', maxWidth: '380px', padding: '32px',
            border: '2px solid rgba(220, 38, 38, 0.4)',
            boxShadow: '0 0 35px rgba(220, 38, 38, 0.25)',
            textAlign: 'center'
          }}>
            <Trash2 size={40} style={{ color: '#dc2626', marginBottom: '16px' }} />
            <h3 style={{ fontFamily: 'Orbitron', color: '#ffffff', fontSize: '1.05rem', marginBottom: '12px' }}>
              Delete Registered User?
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '24px', lineHeight: '1.5' }}>
              Are you sure you want to permanently delete this registered user?
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn-3d btn-secondary"
                style={{ flex: 1, padding: '12px' }}
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button
                className="btn-3d btn-red"
                style={{ flex: 1, padding: '12px' }}
                onClick={handleDeleteConfirmed}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
