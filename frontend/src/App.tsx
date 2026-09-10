import { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { RegisterUser } from './components/RegisterUser';
import { LiveMonitoring } from './components/LiveMonitoring';
import { RegisteredUsers } from './components/RegisteredUsers';
import { DetectionLogs } from './components/DetectionLogs';
import { Settings } from './components/Settings';
import { PremiumBackground } from './components/PremiumBackground';
import { apiService } from './services/api';
import type { User, Log, SystemSettings } from './services/api';
import { 
  Shield, 
  AlertTriangle,
  X
} from 'lucide-react';
import { deleteUserImagesFromSupabase, supabase, isSupabaseConfigured, withRetry } from './services/supabase';
import { serialService, type ArduinoConnectionState } from './services/serialService';
import { loadFaceModels } from './services/modelLoader';



function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLightTheme, setIsLightTheme] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [pendingTabAfterAuth, setPendingTabAfterAuth] = useState('');
  
  // Hardware status
  const [cameraActive, setCameraActive] = useState(false);
  const [arduinoConnectionState, setArduinoConnectionState] = useState<ArduinoConnectionState>(serialService.getConnectionState());
  const [arduinoConnected, setArduinoConnected] = useState(false);
  const [arduinoStatusText, setArduinoStatusText] = useState('No Arduino Connected');
  
  // Emergency Alert States
  const [alertActive, setAlertActive] = useState(false);
  const [alertConfidence, setAlertConfidence] = useState(0);
  const [alertSnapshot, setAlertSnapshot] = useState<string | null>(null);
  const [pendingRegisterPhoto, setPendingRegisterPhoto] = useState<string | null>(null);
  const lastAlertTime = useRef<number>(0);

  // Core Database States
  const [registeredUsers, setRegisteredUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);

  // Intercept tab changes to prompt authentication before accessing Registration
  const handleSetActiveTab = (tab: string) => {
    if (tab === 'register') {
      setPendingTabAfterAuth('register');
      setAuthError('');
      setAuthUsername('');
      setAuthPassword('');
      setShowAuthDialog(true);
    } else {
      setActiveTab(tab);
    }
  };

  const handleAdminVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    // Credentials must be set via VITE_ADMIN_USERNAME / VITE_ADMIN_PASSWORD env vars
    const correctUser = import.meta.env.VITE_ADMIN_USERNAME;
    const correctPass = import.meta.env.VITE_ADMIN_PASSWORD;

    if (!correctUser || !correctPass) {
      setAuthError('Admin credentials are not configured. Set VITE_ADMIN_USERNAME and VITE_ADMIN_PASSWORD in your environment variables.');
      return;
    }

    if (authUsername === correctUser && authPassword === correctPass) {
      setIsLoggedIn(true);
      setShowAuthDialog(false);
      setAuthUsername('');
      setAuthPassword('');
      if (pendingTabAfterAuth) {
        setActiveTab(pendingTabAfterAuth);
        setPendingTabAfterAuth('');
      }
    } else {
      setAuthError('Administrator verification failed. You are not authorized to register new users.');
    }
  };

  // Terminate registration session if administrator logs out
  useEffect(() => {
    if (!isLoggedIn && activeTab === 'register') {
      setActiveTab('dashboard');
      triggerNotification('Administrator logged out. Registration terminated.');
    }
  }, [isLoggedIn, activeTab]);

  // Alerts Notifications state
  const [notifications, setNotifications] = useState<string[]>([]);
  const [notificationsCount, setNotificationsCount] = useState(0);

  // ── Load Initial Data ──────────────────────────────────────────────────────
  // Primary source: Supabase (permanent cloud DB)
  // Fallback: Spring Boot API (local dev only, gracefully no-ops when offline)
  const loadData = useCallback(async () => {
    try {
      if (isSupabaseConfigured && supabase) {
        const db = supabase;
        // Load users, logs, and settings in parallel with retry
        // Wrap in Promise.resolve() because Supabase returns PromiseLike, not full Promise
        const [usersResult, logsResult, settingsResult] = await Promise.allSettled([
          withRetry(() => Promise.resolve(db.from('registered_users').select('*').order('created_at', { ascending: false }))),
          withRetry(() => Promise.resolve(db.from('detection_logs').select('*').order('log_timestamp', { ascending: false }).limit(500))),
          withRetry(() => Promise.resolve(db.from('system_settings').select('*').eq('id', 'default').single()))
        ]);

        if (usersResult.status === 'fulfilled') {
          const { data } = usersResult.value as any;
          if (data) setRegisteredUsers(data as User[]);
        }
        if (logsResult.status === 'fulfilled') {
          const { data } = logsResult.value as any;
          if (data) setLogs(data as Log[]);
        }
        if (settingsResult.status === 'fulfilled') {
          const { data } = settingsResult.value as any;
          if (data) setIsLightTheme((data as SystemSettings).themeMode === 'light');
        }
      } else {
        // Fallback: Spring Boot API (local dev when Supabase not configured)
        const [usersData, logsData] = await Promise.all([
          apiService.getUsers(),
          apiService.getLogs()
        ]);
        setRegisteredUsers(usersData);
        setLogs(logsData);
        apiService.getSettings()
          .then(s => setIsLightTheme(s.themeMode === 'light'))
          .catch(() => {});
      }
    } catch (err) {
      console.error('[VisionGuard] Failed to load data:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Warm up and cache face models in background so Live Monitoring opens instantly with 0ms delay
    loadFaceModels().catch(err => console.warn('[VisionGuard] Background model preloading notice:', err));

    // Poll every 30s (safe for Supabase free tier — avoids rate-limiting)
    const interval = setInterval(() => { loadData(); }, 30000);

    // Reconnect on network recovery (e.g. laptop wakeup, WiFi reconnect)
    const handleOnline = () => {
      console.log('[VisionGuard] Network reconnected — reloading data...');
      loadData();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, [loadData]);

  // ESC key to dismiss active alert modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && alertActive) {
        setAlertActive(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alertActive]);

  // Web Serial Real Connection & Alert System Subscriptions
  useEffect(() => {
    const handleState = (state: ArduinoConnectionState, portInfo?: string) => {
      setArduinoConnectionState(state);
      const isConn = state === 'CONNECTED';
      setArduinoConnected(isConn);

      if (state === 'CONNECTED') {
        const info = portInfo || serialService.getPortInfo() || 'COM Port';
        setArduinoStatusText(`${info} · Alert System Ready`);
      } else if (state === 'PORT_OPEN') {
        setArduinoStatusText('Port Open — Waiting for Arduino Handshake...');
      } else if (state === 'CONNECTING') {
        setArduinoStatusText('Selecting COM Port...');
      } else if (state === 'ERROR') {
        setArduinoStatusText('Device Error / Not Recognized');
      } else {
        setArduinoStatusText('No Arduino Connected');
      }
    };

    // Initialize with current real connection state
    handleState(serialService.getConnectionState());

    // Subscribe to granular state changes
    const unsubState = serialService.onStateChange((state, portInfo) => {
      handleState(state, portInfo);
      if (state === 'CONNECTED') {
        triggerNotification('Arduino Hardware: 🟢 Alert System Connected (D7 LED / D6 Buzzer)');
        setTimeout(() => serialService.sendCommand('PING'), 300);
      } else if (state === 'ERROR') {
        triggerNotification('Arduino Hardware: 🔴 Handshake Failed / Device Not Recognized');
      } else if (state === 'DISCONNECTED') {
        triggerNotification('Arduino Hardware: 🔴 Disconnected');
      }
    });

    // Try silent reconnect to previously permitted port if available
    serialService.tryAutoConnect(9600).catch(err => {
      console.log('[VisionGuard] Serial auto-connect notice:', err);
    });

    return () => {
      unsubState();
    };
  }, []);

  // Sync Theme body class
  useEffect(() => {
    if (isLightTheme) {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [isLightTheme]);
  // Push new log entry helper (Biometric Face Recognition)
  const addLogEntry = async (
    name: string,
    status: string,
    confidence: number,
    photoUrl?: string,
    userId?: string,
    spoofDetected: boolean = false,
    multiplePersons: boolean = false,
    spoofReason?: string,
    livenessScore?: number,
    faceCount: number = 1,
    authMethod: string = 'FACE',
    rawLogData?: any
  ) => {
    // Generate dates dynamically based on system clock at moment of detection
    const now = new Date();
    
    // Format Date: DD MMM YYYY (e.g., 06 Jul 2026)
    const day = String(now.getDate()).padStart(2, '0');
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthStr = months[now.getMonth()];
    const formattedDate = `${day} ${monthStr} ${now.getFullYear()}`;

    // Format Time: hh:mm:ss AM/PM (e.g., 07:45:32 PM)
    let hours = now.getHours();
    const minutesStr = String(now.getMinutes()).padStart(2, '0');
    const secondsStr = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const hoursStr = String(hours).padStart(2, '0');
    const formattedTime = `${hoursStr}:${minutesStr}:${secondsStr} ${ampm}`;

    // Lookup user details if userId is present
    let matchedDesignation = '';
    if (userId) {
      const user = registeredUsers.find(u => u.id === userId);
      if (user && user.designation) {
        matchedDesignation = user.designation;
      }
    }

    // Optimistically add to local state immediately so Dashboard updates right away
    const localLog: Log = {
      id: 'LOCAL-' + Date.now(),
      name,
      status,
      date: formattedDate,
      time: formattedTime,
      confidence: Math.round(confidence),
      photoUrl,
      user_id: userId,
      designation: matchedDesignation,
      camera_id: 'CAM-01',
      log_timestamp: now.toISOString(),
      spoof_detected: spoofDetected,
      multiple_faces: multiplePersons,
      spoof_reason: spoofReason || null,
      liveness_score: livenessScore !== undefined && livenessScore !== null ? Math.round(livenessScore) : null,
      face_count: faceCount,
      auth_method: authMethod,
      raw_log_data: rawLogData || null
    };
    setLogs(prev => [localLog, ...prev]);

    // Build the full Supabase/API payload
    const basePayload = {
      name,
      status,
      date: formattedDate,
      time: formattedTime,
      confidence: Math.round(confidence),
      photoUrl,
      user_id: userId,
      designation: matchedDesignation,
      camera_id: 'CAM-01',
      log_timestamp: now.toISOString(),
      spoof_detected: spoofDetected,
      multiple_faces: multiplePersons,
      spoof_reason: spoofReason || null,
      liveness_score: livenessScore !== undefined && livenessScore !== null ? Math.round(livenessScore) : null,
      face_count: faceCount,
      auth_method: authMethod
    };

    // --- ASYNCHRONOUS NON-BLOCKING BACKGROUND DISPATCH ---
    setTimeout(() => {
      if (isSupabaseConfigured && supabase) {
        const safePayload: Record<string, any> = {
          id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
          name,
          status,
          date: formattedDate,
          time: formattedTime,
          confidence: Math.round(confidence),
          user_id: userId || null,
          designation: matchedDesignation || null,
          camera_id: 'CAM-01',
          log_timestamp: now.toISOString(),
          auth_method: authMethod || 'FACE',
          raw_log_data: rawLogData || null
        };

        if (photoUrl) {
          safePayload.photoUrl = photoUrl;
          // If photoUrl is a remote URL (Supabase Storage), also store it in image_url column
          if (photoUrl.startsWith('http')) {
            safePayload.image_url = photoUrl;
          }
        }

        Promise.resolve(supabase.from('detection_logs').insert(safePayload).select().single())
          .then(({ data, error }) => {
            if (error) {
              console.warn('[VisionGuard] Async Supabase log insert error:', error.message);
            } else if (data) {
              setLogs(prev => prev.map(l => l.id === localLog.id ? (data as any) : l));
            }
          })
          .catch(supabaseErr => console.warn('[VisionGuard] Async Supabase log write exception:', supabaseErr));
      } else {
        apiService.addLog({ ...basePayload })
          .then(newLog => setLogs(prev => prev.map(l => l.id === localLog.id ? (newLog as any) : l)))
          .catch(err => console.warn('[VisionGuard] Spring Boot API log write notice:', err));
      }

      // Non-blocking sync to Spring Boot API
      if (isSupabaseConfigured && supabase) {
        apiService.addLog({ ...basePayload }).catch(() => {});
      }
    }, 0);
  };


  // Handle Unknown Person Detection
  const handleUnknownPersonDetected = async (snapshot: string, confidence: number) => {
    const now = Date.now();
    if (now - lastAlertTime.current > 10000) { // 10-second cooldown
      lastAlertTime.current = now;
      
      setAlertConfidence(confidence);
      setAlertSnapshot(snapshot);
      setAlertActive(true);
      
      // Save log entry to Supabase via Spring Boot API
      await addLogEntry('Unregistered Person', 'Security Alert', confidence, snapshot);
      
      // Trigger user-facing notification alert feed
      triggerNotification("⚠️ ALERT: Unregistered person detected at entry point!");
      
      // Play high warning pitch audio alert
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High warning pitch
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start();
        setTimeout(() => osc.stop(), 500); // Beep duration
      } catch (e) {
        console.error("Audio Context warning beep failed:", e);
      }
    }
  };

  // Push notification alert feed helper
  const triggerNotification = (message: string) => {
    setNotifications(prev => [message, ...prev.slice(0, 19)]); // Cap at 20 alerts
    setNotificationsCount(prev => prev + 1);
  };

  const clearNotifications = () => {
    setNotifications([]);
    setNotificationsCount(0);
  };

  // Register New User Action
  // Primary: write directly to Supabase (works even when Spring Boot is offline)
  // Secondary: also try to sync to Spring Boot API (non-blocking)
  const handleRegisterUser = async (newUser: User) => {
    let registeredUser = newUser;

    // --- PRIMARY PATH: Direct Supabase write ---
    if (isSupabaseConfigured && supabase) {
      try {
        const payload: Record<string, any> = {
          id:                   newUser.id,
          name:                 newUser.name,
          role:                 newUser.role || newUser.designation,
          photoUrl:             newUser.photoUrl || newUser.profile_photo,
          profile_photo:        newUser.profile_photo || newUser.photoUrl,
          regDate:              newUser.regDate,
          faceEmbedding:        newUser.faceEmbedding,
          totalCapturedImages:  newUser.totalCapturedImages ?? 0,
          status:               newUser.status ?? 'Active',
          is_enrolled:          newUser.is_enrolled ?? true,
          enrollment_type:      newUser.enrollment_type ?? 'Biometric',
          gender:               newUser.gender,
          age:                  newUser.age,
          designation:          newUser.designation,
          department:           newUser.department,
          email:                newUser.email,
          phone:                newUser.phone,
          mobile_number:        newUser.mobile_number,
          created_by_admin_name: newUser.created_by_admin_name,
          created_by_admin_id:  newUser.created_by_admin_id,
          registration_status:  newUser.registration_status,
          registrationDate:     newUser.registrationDate,
          registrationTime:     newUser.registrationTime,
          registration_date:    newUser.registration_date,
          registration_time:    newUser.registration_time,
          lastUpdatedDate:      newUser.lastUpdatedDate,
          lastUpdatedTime:      newUser.lastUpdatedTime,
          last_updated_date:    newUser.last_updated_date,
          last_updated_time:    newUser.last_updated_time,
          face_images:          newUser.face_images
        };
        // Strip undefined keys so Supabase doesn't complain
        Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

        const { data, error } = await supabase
          .from('registered_users')
          .upsert(payload, { onConflict: 'id' })
          .select()
          .single();

        if (error) {
          throw new Error(`Supabase error: ${error.message} (code: ${error.code})`);
        }
        if (data) registeredUser = data as User;
        console.log('[VisionGuard] User saved directly to Supabase:', registeredUser.name);
      } catch (supabaseErr: any) {
        console.error('[VisionGuard] Direct Supabase write failed:', supabaseErr);
        throw new Error(`Registration failed: ${supabaseErr.message}`);
      }
    } else {
      // --- FALLBACK: Spring Boot API (only if Supabase is not configured) ---
      try {
        const registered = await apiService.registerUser(newUser);
        registeredUser = registered;
      } catch (apiErr: any) {
        console.error('[VisionGuard] Spring Boot API registration failed:', apiErr);
        throw new Error(`Registration failed: ${apiErr.message}`);
      }
    }

    // --- NON-BLOCKING: Try to also sync to Spring Boot API (best-effort) ---
    if (isSupabaseConfigured && supabase) {
      apiService.registerUser(newUser).catch(e =>
        console.warn('[VisionGuard] Spring Boot sync skipped (backend offline):', e.message)
      );
    }

    await loadData();
    triggerNotification(`Database: Registered personnel profile ${registeredUser.name}`);
    return registeredUser;
  };

  // Revoke/Delete User Action
  const handleDeleteUser = async (id: string) => {
    try {
      // 1. Delete all face images from Supabase Storage (non-fatal — storage errors don't block DB delete)
      try {
        await deleteUserImagesFromSupabase(id);
      } catch (storageErr: any) {
        console.warn('[VisionGuard] Storage cleanup warning (non-fatal):', storageErr?.message);
        // Continue with DB deletion even if storage cleanup fails
      }

      // 2. Perform direct Supabase deletions if configured (primary path)
      if (isSupabaseConfigured && supabase) {
        // Delete associated face embeddings first (foreign key dependency)
        const { error: faceImgErr } = await supabase
          .from('face_images')
          .delete()
          .eq('user_id', id);

        if (faceImgErr) {
          console.warn(`[VisionGuard] Face embeddings delete warning: ${faceImgErr.message} (continuing)`);
          // Don't throw — proceed to delete the user record anyway
        }

        // Delete user record from registered_users
        const { error: userErr } = await supabase
          .from('registered_users')
          .delete()
          .eq('id', id);

        if (userErr) {
          throw new Error(`Failed to delete registered user record: ${userErr.message}`);
        }
      } else {
        // Fallback: Spring Boot REST API
        await apiService.revokeUser(id);
      }

      // 3. Sync delete to Spring Boot API non-blocking if Supabase was the primary path
      if (isSupabaseConfigured && supabase) {
        apiService.revokeUser(id).catch(e => {
          console.warn('[VisionGuard] Spring Boot sync delete skipped (backend offline):', e.message);
        });
      }

      // 4. Force state reload (updates all lists, dashboard counters, and cached users)
      await loadData();
      
      // 5. Success notification
      triggerNotification('User deleted successfully.');
    } catch (err: any) {
      console.error('[VisionGuard] Error deleting user:', err);
      alert(`User deletion failed: ${err.message || err}`);
    }
  };


  // Delete Individual Log Action
  const handleDeleteLog = async (logId: string) => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('detection_logs')
          .delete()
          .eq('id', logId);
        
        if (error) {
          throw new Error(`Supabase log deletion failed: ${error.message}`);
        }
      } else {
        // Fallback: Clear backend logs (offline sync)
        console.warn('[VisionGuard] Deleting single log fallback skip (unsupported on Spring Boot backend)');
      }

      // Update local state directly so dashboard counters and charts update instantly
      setLogs(prev => prev.filter(l => l.id !== logId));
      triggerNotification("Security Log record deleted.");
    } catch (err: any) {
      console.error('[VisionGuard] Failed to delete detection log:', err);
      alert(`Deletion failed: ${err.message || err}`);
    }
  };

  // Edit User Action
  const handleEditUser = async (editedUser: User) => {
    try {
      if (isSupabaseConfigured && supabase) {
        const payload: Record<string, any> = {
          name:                 editedUser.name,
          role:                 editedUser.role || editedUser.designation,
          photoUrl:             editedUser.photoUrl || editedUser.profile_photo,
          profile_photo:        editedUser.profile_photo || editedUser.photoUrl,
          totalCapturedImages:  editedUser.totalCapturedImages,
          gender:               editedUser.gender,
          age:                  editedUser.age,
          designation:          editedUser.designation,
          department:           editedUser.department,
          email:                editedUser.email,
          phone:                editedUser.phone,
          mobile_number:        editedUser.mobile_number,
          lastUpdatedDate:      editedUser.lastUpdatedDate,
          lastUpdatedTime:      editedUser.lastUpdatedTime,
          last_updated_date:    editedUser.last_updated_date,
          last_updated_time:    editedUser.last_updated_time,
          faceEmbedding:        editedUser.faceEmbedding,
          face_images:          editedUser.face_images
        };
        // Strip undefined keys
        Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
        
        const { error } = await supabase
          .from('registered_users')
          .update(payload)
          .eq('id', editedUser.id);
        
        if (error) throw new Error(error.message);
        console.log('[VisionGuard] User updated directly in Supabase:', editedUser.name);
      } else {
        await apiService.updateUser(editedUser.id, editedUser);
      }

      // Best effort sync back to Spring Boot
      if (isSupabaseConfigured && supabase) {
        apiService.updateUser(editedUser.id, editedUser).catch(e =>
          console.warn('[VisionGuard] Spring Boot update sync skipped:', e.message)
        );
      }

      await loadData();
      triggerNotification(`Database: Modified personnel details for ${editedUser.name}`);
    } catch (err: any) {
      console.error('Failed to update user:', err);
      alert(`Update failed: ${err.message || err}`);
    }
  };

  // Sync settings helper — Supabase is primary, Spring Boot is best-effort local sync
  const handleUpdateSettings = async (updatedSettings: SystemSettings) => {
    try {
      if (isSupabaseConfigured && supabase) {
        const payload: Record<string, any> = { ...updatedSettings };
        Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
        const { error } = await supabase
          .from('system_settings')
          .upsert({ id: 'default', ...payload }, { onConflict: 'id' });
        if (error) throw new Error(error.message);
        setIsLightTheme(updatedSettings.themeMode === 'light');
      } else {
        // Fallback: Spring Boot API (local dev)
        const saved = await apiService.updateSettings(updatedSettings);
        setIsLightTheme(saved.themeMode === 'light');
      }
      triggerNotification('Configuration Center: Settings synchronized');
    } catch (err) {
      console.error('[VisionGuard] Failed to save settings:', err);
    }
  };

  // Calculate stats for Dashboard
  const unknownCount = logs.filter(l => l.status === 'Security Alert' || l.status === 'Unknown' || l.status === 'Unregistered Visitor' || l.status === 'Unauthorized').length;

  return (
    <>
      {/* Premium Animated Canvas Background */}
      <PremiumBackground isLightTheme={isLightTheme} activeTab={activeTab} />

      {/* Full-Width Top Red Alert Banner */}
      {alertActive && (
        <div className="security-alert-banner" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '54px',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontFamily: 'Orbitron',
          fontWeight: 800,
          fontSize: '0.95rem',
          letterSpacing: '1px',
          borderBottom: '2px solid #ef4444'
        }}>
          <AlertTriangle size={20} style={{ marginRight: '10px' }} />
          <span>🚨 SECURITY ALERT – UNAUTHORIZED PERSON DETECTED 🚨</span>
        </div>
      )}

      {/* Warning Popup Modal Overlay */}
      {alertActive && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5, 5, 21, 0.82)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1999,
          padding: '20px'
        }}>
          <div className="glass-panel fade-in" style={{
            width: '100%',
            maxWidth: '460px',
            padding: '30px',
            border: '2px solid #dc2626',
            boxShadow: '0 0 35px rgba(220, 38, 38, 0.45)',
            textAlign: 'center',
            background: 'rgba(10, 5, 5, 0.98)'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(220, 38, 38, 0.15)',
              border: '2px solid #dc2626',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto'
            }}>
              <AlertTriangle size={36} />
            </div>
            <h3 style={{ fontFamily: 'Orbitron', fontSize: '1.35rem', color: '#ffffff', marginBottom: '10px' }}>
              ⚠️ Unauthorized Person Detected
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '22px', lineHeight: '1.5' }}>
              This person is not registered in the VisionGuard database and access has been denied. (AI Confidence: {alertConfidence}%)
            </p>
            
            {alertSnapshot && (
              <div style={{ marginBottom: '24px' }}>
                <img 
                  src={alertSnapshot} 
                  alt="Unauthorized snapshot" 
                  style={{
                    width: '130px',
                    height: '130px',
                    borderRadius: '12px',
                    border: '2px solid #dc2626',
                    objectFit: 'cover',
                    boxShadow: '0 0 15px rgba(220, 38, 38, 0.3)'
                  }}
                />
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '14px' }}>
              <button 
                className="btn-3d btn-cyan" 
                style={{ flex: 1, padding: '12px', fontSize: '0.85rem' }} 
                onClick={() => {
                  setPendingRegisterPhoto(alertSnapshot);
                  setAlertActive(false);
                  handleSetActiveTab('register');
                }}
              >
                Register User
              </button>
              <button 
                className="btn-3d btn-secondary" 
                style={{ flex: 1, padding: '12px', fontSize: '0.85rem' }} 
                onClick={() => setAlertActive(false)}
              >
                Ignore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Administrator Verification Dialog Modal */}
      {showAuthDialog && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5, 5, 21, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2100,
          padding: '20px'
        }}>
          <div className="glass-panel fade-in" style={{
            width: '100%',
            maxWidth: '440px',
            padding: '30px',
            border: '1.5px solid var(--border-glass-glow)',
            boxShadow: '0 0 30px rgba(0, 243, 255, 0.25)',
            background: 'rgba(10, 8, 30, 0.98)',
            borderRadius: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
              <h3 style={{ fontFamily: 'Orbitron', fontSize: '1.25rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                🔒 Administrator Verification
              </h3>
              <button
                className="btn-3d btn-secondary"
                style={{ padding: '6px 10px', borderRadius: '8px' }}
                onClick={() => {
                  setShowAuthDialog(false);
                  setPendingTabAfterAuth('');
                }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '20px', lineHeight: '1.4' }}>
              Personnel enrollment requires administrator clearance. Enter credentials to unlock biometric registry.
            </p>

            <form onSubmit={handleAdminVerify} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="cyber-input-group">
                <label className="cyber-input-label">Admin Username</label>
                <input
                  type="text"
                  className="cyber-input"
                  placeholder="Username"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  required
                />
              </div>

              <div className="cyber-input-group">
                <label className="cyber-input-label">Admin Password</label>
                <input
                  type="password"
                  className="cyber-input"
                  placeholder="Password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                />
              </div>

              {authError && (
                <div className="glass-panel" style={{
                  padding: '10px 14px',
                  background: 'rgba(255, 59, 48, 0.1)',
                  border: '1px solid var(--color-red)',
                  color: 'var(--color-red)',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  lineHeight: '1.4',
                  marginTop: '8px'
                }}>
                  {authError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button
                  type="submit"
                  className="btn-3d btn-cyan"
                  style={{ flex: 1, padding: '10px', fontSize: '0.85rem' }}
                >
                  Verify Administrator
                </button>
                <button
                  type="button"
                  className="btn-3d btn-secondary"
                  style={{ flex: 1, padding: '10px', fontSize: '0.85rem' }}
                  onClick={() => {
                    setShowAuthDialog(false);
                    setPendingTabAfterAuth('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top Navbar Menu */}
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={handleSetActiveTab} 
        isLightTheme={isLightTheme} 
        setIsLightTheme={setIsLightTheme} 
        notificationsCount={notificationsCount} 
        notifications={notifications} 
        clearNotifications={clearNotifications} 
        isLoggedIn={isLoggedIn}
        setIsLoggedIn={setIsLoggedIn}
      />

      {/* Main Viewport Container */}
      <div className="app-container">
        <main className="main-content">
          {activeTab === 'dashboard' && (
            <Dashboard 
              usersCount={registeredUsers.length}
              unknownCount={unknownCount}
              cameraActive={cameraActive}
              arduinoConnected={arduinoConnected}
              arduinoConnectionState={arduinoConnectionState}
              arduinoStatusDetails={arduinoStatusText}
              onNavigate={handleSetActiveTab}
              recentLogs={logs}
              alertActive={alertActive}
            />
          )}

          {activeTab === 'register' && (
            <RegisterUser 
              onRegister={handleRegisterUser}
              onCancel={() => {
                setIsLoggedIn(false);
                setActiveTab('dashboard');
              }}
              onSuccess={() => {
                setIsLoggedIn(false);
                setActiveTab('users');
              }}
              cameraActive={cameraActive}
              setCameraActive={setCameraActive}
              registeredUsers={registeredUsers}
              prefilledPhoto={pendingRegisterPhoto}
              onClearPrefilledPhoto={() => setPendingRegisterPhoto(null)}
              adminName="Jaswanth"
              adminId="ADMIN_01"
            />
          )}

          {activeTab === 'monitoring' && (
            <LiveMonitoring 
              registeredUsers={registeredUsers}
              cameraActive={cameraActive}
              setCameraActive={setCameraActive}
              arduinoConnected={arduinoConnected}
              arduinoConnectionState={arduinoConnectionState}
              arduinoStatusText={arduinoStatusText}
              triggerNotification={triggerNotification}
              addLogEntry={addLogEntry}
              onUnknownPersonDetected={handleUnknownPersonDetected}
              reloadUserData={loadData}
              setAlertActive={setAlertActive}
            />
          )}

          {activeTab === 'users' && (
            <RegisteredUsers 
              users={registeredUsers}
              onDeleteUser={handleDeleteUser}
              onEditUser={handleEditUser}
              arduinoConnected={arduinoConnected}
            />
          )}

          {activeTab === 'logs' && (
            <DetectionLogs 
              logs={logs}
              onDeleteLog={handleDeleteLog}
            />
          )}

          {activeTab === 'settings' && (
            <Settings 
              isLightTheme={isLightTheme}
              setIsLightTheme={setIsLightTheme}
              arduinoConnected={arduinoConnected}
              arduinoConnectionState={arduinoConnectionState}
              setArduinoConnected={setArduinoConnected}
              onSaveSettings={handleUpdateSettings}
            />
          )}
        </main>
      </div>

      {/* Futuristic Enterprise Footer */}
      <footer style={{ 
        marginTop: '60px', 
        padding: '30px 24px', 
        borderTop: '1px solid var(--border-glass)',
        background: 'rgba(5, 5, 21, 0.4)',
        backdropFilter: 'blur(8px)',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: 'var(--text-muted)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Shield size={14} style={{ color: 'var(--color-cyan)' }} />
          <span style={{ fontFamily: 'Orbitron', fontWeight: 700, letterSpacing: '0.5px', color: '#ffffff' }}>VISIONGUARD ACCESS CONTROL SYSTEM</span>
        </div>
        <p>© 2026 VisionGuard Inc. All rights reserved. AI-Powered Face Recognition & Access Control.</p>
      </footer>
    </>
  );
}

export default App;
