import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Camera, 
  Cpu, 
  Save, 
  RefreshCw,
  Sliders,
  CheckCircle,
  Database,
  Volume2,
  Bell,
  AlertCircle
} from 'lucide-react';
import { apiService } from '../services/api';
import { serialService, type ArduinoConnectionState } from '../services/serialService';

interface SettingsProps {
  isLightTheme: boolean;
  setIsLightTheme: (val: boolean) => void;
  arduinoConnected: boolean;
  arduinoConnectionState?: ArduinoConnectionState;
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
  arduinoConnectionState,
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
  const [serialConnecting, setSerialConnecting] = useState(false);
  const [serialStatusMsg, setSerialStatusMsg] = useState('');
  const [connectionState, setConnectionState] = useState<ArduinoConnectionState>(
    arduinoConnectionState || serialService.getConnectionState()
  );
  const [testLedActive, setTestLedActive] = useState(false);
  const [testBuzzerActive, setTestBuzzerActive] = useState(false);
  const [testPingResult, setTestPingResult] = useState<string | null>(null);

  // Keep connectionState in sync with prop if changed from outside
  useEffect(() => {
    if (arduinoConnectionState) {
      setConnectionState(arduinoConnectionState);
    }
  }, [arduinoConnectionState]);

  useEffect(() => {
    // Listen to incoming messages for ARDUINO_READY and PONG
    const unsubMsg = serialService.onMessage((msg) => {
      if (msg === 'PONG') {
        setTestPingResult('✓ Arduino Responded: PONG');
        setTimeout(() => setTestPingResult(null), 3500);
      }
    });

    const unsubState = serialService.onStateChange((state) => {
      setConnectionState(state);
      setArduinoConnected(state === 'CONNECTED');
    });

    return () => {
      unsubMsg();
      unsubState();
    };
  }, [setArduinoConnected]);

  const handleConnectSerial = async () => {
    setSerialConnecting(true);
    setSerialStatusMsg('');
    try {
      const connected = await serialService.requestAndConnect(9600);
      if (connected) {
        setArduinoConnected(true);
        setSerialStatusMsg('Connected to Arduino Uno at 9600 baud.');
        // Ping Arduino to check responsiveness
        setTimeout(() => serialService.sendCommand('PING'), 300);
      } else {
        setSerialStatusMsg('No port selected.');
      }
    } catch (err: any) {
      console.error('Serial connection error:', err);
      setSerialStatusMsg(err.message || 'Connection failed. Check USB connection and driver.');
    } finally {
      setSerialConnecting(false);
    }
  };

  const handleDisconnectSerial = async () => {
    await serialService.disconnect();
    setArduinoConnected(false);
    setSerialStatusMsg('Arduino disconnected.');
  };

  const handleTestPing = async () => {
    setTestPingResult('Sending PING...');
    const sent = await serialService.sendCommand('PING');
    if (!sent) {
      setTestPingResult('❌ Failed to send — port not connected');
      setTimeout(() => setTestPingResult(null), 4000);
      return;
    }
    // Timeout watchdog: If PONG is not received within 3 seconds, show failure
    setTimeout(() => {
      setTestPingResult(prev => (prev === 'Sending PING...' ? '❌ Arduino communication failed (No PONG received)' : prev));
    }, 3000);
  };

  const handleTestLed = async () => {
    setTestLedActive(true);
    await serialService.sendCommand('TEST_LED');
    setTimeout(() => setTestLedActive(false), 2200);
  };

  const handleTestBuzzer = async () => {
    setTestBuzzerActive(true);
    await serialService.sendCommand('TEST_BUZZER');
    setTimeout(() => setTestBuzzerActive(false), 1700);
  };



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

            {/* Real Hardware Relay Arming Status */}
            <div className="cyber-switch-container">
              <div>
                <div style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Hardware Alert System (LED D7 / Buzzer D6)</span>
                  <span className={`cyber-badge ${arduinoConnected ? 'badge-authorized' : 'badge-unknown'}`} style={{ fontSize: '0.65rem' }}>
                    {arduinoConnected ? 'ARMED 🟢' : 'HARDWARE OFFLINE ⚪'}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {arduinoConnected
                    ? 'Arduino I/O link active — LED and buzzer trigger on unauthorized face detection.'
                    : 'Arduino disconnected. Connect board below to arm physical alert relay.'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ 
                  fontFamily: 'Orbitron', 
                  fontSize: '0.78rem', 
                  color: arduinoConnected ? 'var(--color-emerald)' : 'var(--text-muted)',
                  fontWeight: 600
                }}>
                  {arduinoConnected ? 'ONLINE' : 'STANDBY'}
                </span>
              </div>
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

        {/* Section 4: Arduino Hardware Alert Controller */}
        <div>
          <h3 style={{ fontSize: '1.05rem', color: '#ffffff', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={16} style={{ color: 'var(--color-cyan)' }} />
            Arduino Uno Alert Hardware Controller
          </h3>

          {!serialService.isSupported() && (
            <div className="glass-panel" style={{
              padding: '12px 18px',
              background: 'rgba(255, 59, 48, 0.1)',
              border: '1px solid var(--color-red)',
              color: 'var(--color-red)',
              borderRadius: '12px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px'
            }}>
              <AlertCircle size={16} />
              <span>Web Serial is not supported in this browser. Please use a compatible Chromium-based browser (Chrome or Edge) on the computer connected to the Arduino.</span>
            </div>
          )}

          {/* Hardware Status Panel */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '16px'
          }}>
            <div className="glass-panel" style={{ padding: '14px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Arduino Status</div>
              <div style={{ 
                fontFamily: 'Orbitron', 
                fontSize: '0.95rem', 
                color: connectionState === 'CONNECTED' ? 'var(--color-emerald)' : (connectionState === 'PORT_OPEN') ? '#ffb700' : 'var(--color-red)',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span className={`sys-status-dot ${connectionState === 'CONNECTED' ? 'dot-green' : connectionState === 'PORT_OPEN' ? 'dot-orange' : 'dot-red'}`} />
                {connectionState === 'CONNECTED' ? 'CONNECTED' :
                 connectionState === 'PORT_OPEN' ? 'PORT OPEN' :
                 connectionState === 'CONNECTING' ? 'CONNECTING...' :
                 connectionState === 'ERROR' ? 'ERROR' : 'DISCONNECTED'}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '14px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>COM Port</div>
              <div style={{ fontFamily: 'Orbitron', fontSize: '0.85rem', color: '#ffffff', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={connectionState !== 'DISCONNECTED' ? (serialService.getPortInfo() || comPort) : 'Disconnected'}>
                {connectionState !== 'DISCONNECTED' ? (serialService.getPortInfo() || comPort) : 'DISCONNECTED'}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '14px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Alert LED (D7)</div>
              <div style={{ fontFamily: 'Orbitron', fontSize: '0.95rem', color: connectionState === 'CONNECTED' ? 'var(--color-emerald)' : 'var(--text-muted)', fontWeight: 700 }}>
                {connectionState === 'CONNECTED' ? 'READY ✓' : 'OFFLINE'}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '14px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Alert Buzzer (D6)</div>
              <div style={{ fontFamily: 'Orbitron', fontSize: '0.85rem', color: connectionState === 'CONNECTED' ? 'var(--color-cyan)' : '#ffffff', fontWeight: 700 }}>
                {connectionState === 'CONNECTED' ? 'READY ✓' : 'OFFLINE'}
              </div>
            </div>
          </div>

          {/* Connection & Action Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
            {connectionState === 'DISCONNECTED' || connectionState === 'ERROR' ? (
              <button
                type="button"
                className="btn-3d btn-cyan"
                onClick={handleConnectSerial}
                disabled={serialConnecting || !serialService.isSupported()}
                style={{ padding: '9px 18px', fontSize: '0.85rem' }}
              >
                <Cpu size={15} />
                {serialConnecting ? 'Detecting Ports...' : 'Connect Arduino (Select COM Port)'}
              </button>
            ) : (
              <button
                type="button"
                className="btn-3d btn-red"
                onClick={handleDisconnectSerial}
                style={{ padding: '9px 18px', fontSize: '0.85rem' }}
              >
                Disconnect Arduino
              </button>
            )}

            {arduinoConnected && (
              <>
                <button
                  type="button"
                  className="btn-3d btn-secondary"
                  onClick={handleTestPing}
                  style={{ padding: '9px 14px', fontSize: '0.82rem' }}
                >
                  Test Ping
                </button>
                <button
                  type="button"
                  className="btn-3d btn-secondary"
                  onClick={handleTestLed}
                  disabled={testLedActive}
                  style={{ padding: '9px 14px', fontSize: '0.82rem', borderColor: testLedActive ? 'var(--color-emerald)' : undefined }}
                >
                  <Bell size={14} />
                  {testLedActive ? 'LED Flashing...' : 'Test LED (D7)'}
                </button>
                <button
                  type="button"
                  className="btn-3d btn-secondary"
                  onClick={handleTestBuzzer}
                  disabled={testBuzzerActive}
                  style={{ padding: '9px 14px', fontSize: '0.82rem', borderColor: testBuzzerActive ? 'var(--color-orange)' : undefined }}
                >
                  <Volume2 size={14} />
                  {testBuzzerActive ? 'Beeping...' : 'Test Buzzer (D6)'}
                </button>
              </>
            )}
          </div>

          {/* Status Message / Feedback */}
          {serialStatusMsg && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              ℹ️ {serialStatusMsg}
            </div>
          )}

          {testPingResult && (
            <div style={{
              fontSize: '0.84rem',
              color: testPingResult.includes('✓') ? 'var(--color-emerald)' : testPingResult.includes('❌') ? 'var(--color-red)' : 'var(--color-cyan)',
              fontWeight: 700,
              marginBottom: '10px',
              fontFamily: 'Orbitron',
              letterSpacing: '0.5px'
            }}>
              {testPingResult}
            </div>
          )}



          {/* CH340G Driver & Troubleshooting Note */}
          <div style={{
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            lineHeight: '1.5',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-glass)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginTop: '12px'
          }}>
            <div style={{ fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>CH340G USB-to-Serial Note (Windows):</div>
            If Windows does not detect the Arduino board in the port selection dialog, verify that the CH340G USB driver is installed in <strong>Device Manager → Ports (COM & LPT)</strong>. 
            Once recognized by Windows, click <em>Connect Arduino</em> and choose the designated COM port from the prompt.
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)' }} />

        {/* Save button panel */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: 'auto' }}>
            <Database size={14} />
            <span>Primary Storage: <code style={{ color: 'var(--color-cyan)' }}>Supabase Cloud Database</code> (Direct Web Serial to Arduino)</span>
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
