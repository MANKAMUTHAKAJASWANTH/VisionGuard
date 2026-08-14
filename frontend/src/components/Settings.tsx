import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Camera, 
  Cpu, 
  Save, 
  RefreshCw,
  Sliders,
  CheckCircle,
  Database
} from 'lucide-react';
import { apiService } from '../services/api';

interface SettingsProps {
  isLightTheme: boolean;
  setIsLightTheme: (val: boolean) => void;
  arduinoConnected: boolean;
  setArduinoConnected: (val: boolean) => void;
  onSaveSettings: (settings: {
    cameraSource: string;
    comPort: string;
    alarmSound: boolean;
    confidenceThreshold: number;
    arduinoConnected: boolean;
    themeMode: string;
    securityMode?: boolean;
    security_mode?: boolean;
  }) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  isLightTheme,
  setIsLightTheme,
  arduinoConnected,
  setArduinoConnected,
  onSaveSettings
}) => {
  const [cameraSource, setCameraSource] = useState('Front Entrance Camera [USB-0]');
  const [comPort, setComPort] = useState('COM4');
  const [alarmSound, setAlarmSound] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(85);
  const [securityMode, setSecurityMode] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Pre-populate settings from database on mount
  useEffect(() => {
    apiService.getSettings()
      .then(settings => {
        if (settings.cameraSource) setCameraSource(settings.cameraSource);
        if (settings.comPort) setComPort(settings.comPort);
        setAlarmSound(settings.alarmSound);
        if (settings.confidenceThreshold) setConfidenceThreshold(settings.confidenceThreshold);
        setSecurityMode(!!(settings.securityMode || settings.security_mode));
        setArduinoConnected(!!settings.arduinoConnected);
        setIsLightTheme(settings.themeMode === 'light');
      })
      .catch(err => {
        console.error('[VisionGuard Config] Failed to load settings from API:', err);
      });
  }, []);

  const handleSave = () => {
    setSaveLoading(true);
    setSaveSuccess(false);
    
    // Call parent handler to save settings to Spring Boot API
    onSaveSettings({
      cameraSource,
      comPort,
      alarmSound,
      confidenceThreshold,
      arduinoConnected,
      themeMode: isLightTheme ? 'light' : 'dark',
      securityMode,
      security_mode: securityMode
    });

    setTimeout(() => {
      setSaveLoading(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 800);
  };

  return (
    <div className="fade-in glass-panel" style={{ padding: '30px', maxWidth: '1000px', margin: '0 auto' }}>
      
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '20px', marginBottom: '28px' }}>
        <h2 style={{ fontFamily: 'Orbitron', fontSize: '1.6rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <SettingsIcon size={24} style={{ color: 'var(--color-cyan)' }} />
          Configuration Center
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '6px' }}>
          Configure face recognition thresholds, camera sources, security mode, and hardware relay settings for access control.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Success Alert popup */}
        {saveSuccess && (
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
            <CheckCircle size={16} />
            <span>Settings saved successfully and synced with VisionGuard access control system!</span>
          </div>
        )}

        {/* Section 1: Capture & Scanning Sources */}
        <div>
          <h3 style={{ fontSize: '1.05rem', color: '#ffffff', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={16} style={{ color: 'var(--color-cyan)' }} />
            Sensor Interfaces
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            
            {/* Camera Select */}
            <div className="cyber-input-group">
              <label className="cyber-input-label">Active Camera Feed</label>
              <select 
                className="cyber-input cyber-select"
                value={cameraSource}
                onChange={(e) => setCameraSource(e.target.value)}
              >
                <option value="Front Entrance Camera [USB-0]">Front Entrance Camera [USB-0]</option>
                <option value="Back Office IP Camera">Back Office IP Camera</option>
                <option value="Loading Dock Dome [RTSP]">Loading Dock Dome [RTSP]</option>
                <option value="Virtual Face Scanner Sim">Virtual Face Scanner Sim</option>
              </select>
            </div>

            {/* Arduino COM Port */}
            <div className="cyber-input-group">
              <label className="cyber-input-label">Arduino COM Port</label>
              <select 
                className="cyber-input cyber-select"
                value={comPort}
                onChange={(e) => setComPort(e.target.value)}
              >
                <option value="COM1">COM1 (System Board)</option>
                <option value="COM3">COM3 (Unused)</option>
                <option value="COM4">COM4 (Access Lock Relay)</option>
                <option value="COM5">COM5 (Aux Alarm Siren)</option>
              </select>
            </div>

          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)' }} />

        {/* Section 2: AI Neural Thresholds */}
        <div>
          <h3 style={{ fontSize: '1.05rem', color: '#ffffff', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={16} style={{ color: 'var(--color-purple)' }} />
            Neural Network Thresholds
          </h3>

          <div className="cyber-input-group" style={{ gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Confidence Target (Matching)</span>
              <span style={{ color: 'var(--color-cyan)', fontWeight: 700, fontFamily: 'Orbitron' }}>
                {confidenceThreshold}%
              </span>
            </div>
            
            <input 
              type="range" 
              className="premium-range-slider"
              min="50" 
              max="99" 
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(parseInt(e.target.value))}
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Confidence below this value will flag matched users as unverified intruders. Default: 85%
            </span>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)' }} />

        {/* Section 3: Telemetry & Alarms */}
        <div>
          <h3 style={{ fontSize: '1.05rem', color: '#ffffff', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={16} style={{ color: 'var(--color-orange)' }} />
            Relay Outputs & Alarms
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Alarm Sound toggle */}
            <div className="cyber-switch-container">
              <div>
                <div style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 600 }}>Enable Alarm Beep Output</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Generate audio alerts inside dashboard on intruder warnings.</div>
              </div>
              <label className="cyber-switch">
                <input 
                  type="checkbox" 
                  checked={alarmSound} 
                  onChange={(e) => setAlarmSound(e.target.checked)}
                />
                <span className="cyber-slider" />
              </label>
            </div>

            {/* Arduino Connection Link toggle */}
            <div className="cyber-switch-container">
              <div>
                <div style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 600 }}>Arduino I/O Telemetry Link</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Arm the Arduino board to toggle lock relays when access is granted.</div>
              </div>
              <label className="cyber-switch">
                <input 
                  type="checkbox" 
                  checked={arduinoConnected} 
                  onChange={(e) => setArduinoConnected(e.target.checked)}
                />
                <span className="cyber-slider" />
              </label>
            </div>

            {/* Security Mode toggle */}
            <div className="cyber-switch-container">
              <div>
                <div style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 600 }}>Active Security Mode</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Flag unknown people as immediate security alerts instead of visitors.</div>
              </div>
              <label className="cyber-switch">
                <input 
                  type="checkbox" 
                  checked={securityMode} 
                  onChange={(e) => setSecurityMode(e.target.checked)}
                />
                <span className="cyber-slider" />
              </label>
            </div>

            {/* Theme Toggle option */}
            <div className="cyber-switch-container">
              <div>
                <div style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 600 }}>Light Theme Interface</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Toggle global dashboard styling to a bright ambient setup.</div>
              </div>
              <label className="cyber-switch">
                <input 
                  type="checkbox" 
                  checked={isLightTheme} 
                  onChange={(e) => setIsLightTheme(e.target.checked)}
                />
                <span className="cyber-slider" />
              </label>
            </div>

          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)' }} />

        {/* Save button panel */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: 'auto' }}>
            <Database size={14} />
            <span>Node Endpoint: <code>127.0.0.1:8080/api/settings</code></span>
          </div>

          <button 
            className="btn-3d btn-cyan" 
            onClick={handleSave}
            disabled={saveLoading}
            style={{ minWidth: '160px' }}
          >
            {saveLoading ? (
              <>
                <RefreshCw size={16} className="animate-pulse" style={{ animation: 'spin 1s linear infinite' }} />
                Syncing Settings...
              </>
            ) : (
              <>
                <Save size={16} />
                Save Settings
              </>
            )}
          </button>
        </div>

      </div>

    </div>
  );
};
