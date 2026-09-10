import React, { useState, useEffect } from "react";
import { 
  Users, 
  UserX, 
  Camera, 
  Cpu, 
  Activity,
  Shield,
  Database,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  Server,
  Lock,
  TrendingUp,
  UserCheck,
  Radio,
  Wifi,
  Volume2
} from "lucide-react";
import type { ArduinoConnectionState } from "../services/serialService";

interface DashboardProps {
  usersCount: number;
  unknownCount: number;
  cameraActive: boolean;
  arduinoConnected: boolean;
  arduinoConnectionState?: ArduinoConnectionState;
  arduinoStatusDetails: string;
  onNavigate: (tab: string) => void;
  recentLogs: any[];
  alertActive?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = (props) => {
  const {
    usersCount,
    unknownCount,
    cameraActive,
    arduinoConnected,
    arduinoConnectionState,
    arduinoStatusDetails,
    recentLogs,
    onNavigate,
    alertActive
  } = props;

  const [currentTime, setCurrentTime] = useState(new Date());

  // Derive refined Arduino Alert System UI state from granular connection state
  const connState = arduinoConnectionState || (arduinoConnected ? 'CONNECTED' : 'DISCONNECTED');
  const isArduinoFullyOnline = connState === 'CONNECTED';
  const isArduinoPending = connState === 'PORT_OPEN' || connState === 'CONNECTING';
  const isArduinoError = connState === 'ERROR';

  const arduinoStatusDotClass = isArduinoFullyOnline ? 'dot-green' : isArduinoPending ? 'dot-orange' : 'dot-red';
  const arduinoHeroText = isArduinoFullyOnline ? 'Connected' : isArduinoPending ? 'Handshaking...' : isArduinoError ? 'Error' : 'Disconnected';

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter logs by today's date for accurate "today" metrics matching the new DD MMM YYYY format
  const nowForDate = new Date();
  const todayDay = String(nowForDate.getDate()).padStart(2, '0');
  const todayMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const todayDateStr = `${todayDay} ${todayMonths[nowForDate.getMonth()]} ${nowForDate.getFullYear()}`;

  const todayLogs = recentLogs.filter((l) => l.date === todayDateStr);
  const authorizedToday = todayLogs.filter((l) => l.status.toUpperCase().includes("AUTHORIZED") && !l.status.toUpperCase().includes("UNAUTHORIZED")).length;
  const unauthorizedToday = todayLogs.filter((l) => !l.status.toUpperCase().includes("AUTHORIZED") || l.status.toUpperCase().includes("UNAUTHORIZED")).length;
  const todayDetections = todayLogs.length;

  const systemHealthScore = (cameraActive ? 25 : 0) + (arduinoConnected ? 25 : 0) + (usersCount > 0 ? 25 : 0) + 25;

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="fade-in dashboard-page">

      {/* Hero Banner */}
      <div className="glass-panel hero-banner">
        <div className="hero-banner-left">
          <div className="hero-status-pill">
            <span className="hero-dot" />
            <span>SYSTEM ACTIVE</span>
          </div>
          <h1 className="hero-title">Access Control System Active</h1>
          <p className="hero-description">
            VisionGuard AI Face Recognition engine is active and operational. Monitoring restricted area access
            in real-time, verifying authorized personnel, identifying unauthorized individuals, and securely
            recording all entry events to the database.
          </p>
          <div className="hero-actions">
            <button className="btn-3d btn-cyan" onClick={() => onNavigate("monitoring")}>
              <Eye size={16} /> Live Monitoring
            </button>
            <button className="btn-3d btn-secondary" onClick={() => onNavigate("register")}>
              <Users size={16} /> Register User
            </button>
          </div>
        </div>
        <div className="hero-banner-right">
          <div className="hero-clock-card">
            <div className="hero-clock-time">{formatTime(currentTime)}</div>
            <div className="hero-clock-date">{formatDate(currentTime)}</div>
            <div style={{ marginTop: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div className="hero-sys-status">
                <span className={"sys-status-dot " + (cameraActive ? "dot-green" : "dot-red")} />
                <span>Camera: {cameraActive ? "Online" : "Offline"}</span>
              </div>
              <div className="hero-sys-status">
                <span className={"sys-status-dot " + arduinoStatusDotClass} />
                <span>Arduino: {arduinoHeroText}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section Label */}
      <div className="section-label">
        <TrendingUp size={14} style={{ color: "var(--color-cyan)" }} />
        <span>Real-Time Security Metrics</span>
      </div>

      {/* KPI Cards Grid (8 cards) */}
      <div className="kpi-grid">

        <div className="glass-panel glass-panel-hover kpi-card" onClick={() => onNavigate("users")}>
          <div className="kpi-icon-box" style={{ background: "rgba(0,102,255,0.18)", color: "#00f3ff" }}>
            <Users size={26} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Registered Users</span>
            <div className="kpi-value">{usersCount}</div>
            <span className="kpi-sub">Authorized personnel profiles</span>
          </div>
        </div>

        <div className="glass-panel glass-panel-hover kpi-card" onClick={() => onNavigate("logs")}>
          <div className="kpi-icon-box" style={{ background: "rgba(0,255,136,0.15)", color: "#00ff88" }}>
            <UserCheck size={26} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Authorized Today</span>
            <div className="kpi-value" style={{ color: "#00ff88" }}>{authorizedToday}</div>
            <span className="kpi-sub">Verified access granted</span>
          </div>
        </div>

        <div className={"glass-panel glass-panel-hover kpi-card" + (unauthorizedToday > 0 || unknownCount > 0 ? " flash-red-card" : "")} onClick={() => onNavigate("logs")}>
          <div className="kpi-icon-box" style={{ background: unknownCount > 0 ? "rgba(220,38,38,0.2)" : "rgba(249,115,22,0.15)", color: unknownCount > 0 ? "#ff3b30" : "#ff6b00" }}>
            <UserX size={26} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Unauthorized Access</span>
            <div className="kpi-value" style={{ color: unknownCount > 0 ? "#ff3b30" : "#ffffff" }}>{unauthorizedToday}</div>
            <span className="kpi-sub">Intrusion attempts today</span>
          </div>
        </div>

        <div className={"glass-panel glass-panel-hover kpi-card" + (alertActive ? " flash-red-card" : "")} onClick={() => onNavigate("logs")}>
          <div className="kpi-icon-box" style={{ background: alertActive ? "rgba(220,38,38,0.2)" : "rgba(249,115,22,0.12)", color: alertActive ? "#ff3b30" : "#ff6b00" }}>
            <AlertTriangle size={26} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Security Alerts</span>
            <div className="kpi-value" style={{ color: alertActive ? "#ff3b30" : "#ffffff" }}>{alertActive ? "ALERT" : "Clear"}</div>
            <span className="kpi-sub">{alertActive ? "Intrusion in progress!" : "No active threats"}</span>
          </div>
        </div>

        <div className="glass-panel glass-panel-hover kpi-card" onClick={() => onNavigate("monitoring")}>
          <div className="kpi-icon-box" style={{ background: cameraActive ? "rgba(0,243,255,0.15)" : "rgba(100,100,100,0.15)", color: cameraActive ? "#00f3ff" : "#8fa0c5" }}>
            <Camera size={26} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Camera Status</span>
            <div className="kpi-value" style={{ color: cameraActive ? "#00ff88" : "#ff3b30", fontFamily: "Orbitron", fontSize: "1.5rem" }}>
              {cameraActive ? "Online" : "Offline"}
            </div>
            <span className="kpi-sub">CCTV stream {cameraActive ? "active" : "inactive"}</span>
          </div>
        </div>

        <div className="glass-panel glass-panel-hover kpi-card" onClick={() => onNavigate("settings")}>
          <div className="kpi-icon-box" style={{ 
            background: isArduinoFullyOnline ? "rgba(0,255,136,0.15)" : isArduinoPending ? "rgba(255,183,0,0.15)" : "rgba(100,100,100,0.15)", 
            color: isArduinoFullyOnline ? "#00ff88" : isArduinoPending ? "#ffb700" : "#ff3b30" 
          }}>
            <Cpu size={26} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Arduino Alert System</span>
            <div className="kpi-value" style={{ 
              color: isArduinoFullyOnline ? "#00ff88" : isArduinoPending ? "#ffb700" : "#ff3b30", 
              fontFamily: "Orbitron", 
              fontSize: "1.35rem" 
            }}>
              {isArduinoFullyOnline ? "Online" : isArduinoPending ? "Pending" : isArduinoError ? "Error" : "Offline"}
            </div>
            <span className="kpi-sub">
              {isArduinoFullyOnline
                ? "D7 LED + D6 Buzzer Armed" 
                : isArduinoPending
                ? "Waiting for handshake..."
                : isArduinoError
                ? "Device not recognized"
                : "No Arduino detected"}
            </span>
          </div>
        </div>

        <div className="glass-panel glass-panel-hover kpi-card" onClick={() => onNavigate("logs")}>
          <div className="kpi-icon-box" style={{ background: "rgba(181,0,255,0.15)", color: "#b500ff" }}>
            <Clock size={26} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Today's Detections</span>
            <div className="kpi-value" style={{ color: "#b500ff" }}>{todayDetections}</div>
            <span className="kpi-sub">Total face scan events today</span>
          </div>
        </div>

        <div className="glass-panel glass-panel-hover kpi-card" onClick={() => onNavigate("settings")}>
          <div className="kpi-icon-box" style={{ background: "rgba(0,243,255,0.12)", color: "#00f3ff" }}>
            <Activity size={26} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">System Health</span>
            <div className="kpi-value" style={{ color: systemHealthScore >= 75 ? "#00ff88" : systemHealthScore >= 50 ? "#ff6b00" : "#ff3b30" }}>
              {systemHealthScore}%
            </div>
            <span className="kpi-sub">Overall operational score</span>
          </div>
        </div>

      </div>

      {/* System Component Status */}
      <div className="section-label">
        <Server size={14} style={{ color: "var(--color-cyan)" }} />
        <span>System Component Status</span>
      </div>
      <div className="status-row-grid">

        <div className="glass-panel status-card">
          <div className="status-card-inner">
            <div className="status-icon-sm" style={{ background: "rgba(0,243,255,0.12)", color: "#00f3ff" }}>
              <Zap size={18} />
            </div>
            <div>
              <div className="status-card-label">AI Engine</div>
              <div className="status-badge status-badge-online"><span className="sys-status-dot dot-green" />Face Recognition Active</div>
            </div>
          </div>
          <div className="status-card-desc">FaceNet neural network · Real-time inference enabled</div>
        </div>

        <div className="glass-panel status-card">
          <div className="status-card-inner">
            <div className="status-icon-sm" style={{ background: "rgba(181,0,255,0.12)", color: "#b500ff" }}>
              <Database size={18} />
            </div>
            <div>
              <div className="status-card-label">Database Status</div>
              <div className="status-badge status-badge-online"><span className="sys-status-dot dot-green" />Supabase Connected</div>
            </div>
          </div>
          <div className="status-card-desc">{usersCount} user profiles loaded · PostgreSQL sync active</div>
        </div>

        <div className="glass-panel status-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("monitoring")}>
          <div className="status-card-inner">
            <div className="status-icon-sm" style={{ background: cameraActive ? "rgba(0,255,136,0.12)" : "rgba(100,100,100,0.12)", color: cameraActive ? "#00ff88" : "#8fa0c5" }}>
              <Eye size={18} />
            </div>
            <div>
              <div className="status-card-label">Live Monitoring</div>
              <div className={"status-badge " + (cameraActive ? "status-badge-online" : "status-badge-offline")}>
                <span className={"sys-status-dot " + (cameraActive ? "dot-green" : "dot-gray")} />
                {cameraActive ? "CCTV Feed Active" : "Camera Offline"}
              </div>
            </div>
          </div>
          <div className="status-card-desc">{cameraActive ? "Real-time face scanning in progress" : "Click to start live monitoring"}</div>
        </div>

        <div className="glass-panel status-card">
          <div className="status-card-inner">
            <div className="status-icon-sm" style={{ background: "rgba(255,107,0,0.12)", color: "#ff6b00" }}>
              <Lock size={18} />
            </div>
            <div>
              <div className="status-card-label">Security Mode</div>
              <div className="status-badge status-badge-warning"><span className="sys-status-dot dot-orange" />Standard Mode</div>
            </div>
          </div>
          <div className="status-card-desc">Alert threshold: 85% confidence · Alarm enabled</div>
        </div>

        <div className="glass-panel status-card">
          <div className="status-card-inner">
            <div className="status-icon-sm" style={{ background: "rgba(0,102,255,0.12)", color: "#00f3ff" }}>
              <Wifi size={18} />
            </div>
            <div>
              <div className="status-card-label">Face Recognition</div>
              <div className="status-badge status-badge-online"><span className="sys-status-dot dot-green" />Engine Running</div>
            </div>
          </div>
          <div className="status-card-desc">Euclidean distance matching · 7-frame temporal smoothing</div>
        </div>

        <div className="glass-panel status-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("monitoring")}>
          <div className="status-card-inner">
            <div className="status-icon-sm" style={{ background: cameraActive ? "rgba(0,255,136,0.12)" : "rgba(100,100,100,0.12)", color: cameraActive ? "#00ff88" : "#8fa0c5" }}>
              <Radio size={18} />
            </div>
            <div>
              <div className="status-card-label">CCTV Status</div>
              <div className={"status-badge " + (cameraActive ? "status-badge-online" : "status-badge-offline")}>
                <span className={"sys-status-dot " + (cameraActive ? "dot-green" : "dot-gray")} />
                {cameraActive ? "Streaming" : "Standby"}
              </div>
            </div>
          </div>
          <div className="status-card-desc">Entrance camera · USB or IP stream supported</div>
        </div>

        <div className="glass-panel status-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("settings")}>
          <div className="status-card-inner">
            <div className="status-icon-sm" style={{ 
              background: isArduinoFullyOnline ? "rgba(0,255,136,0.12)" : isArduinoPending ? "rgba(255,183,0,0.12)" : "rgba(100,100,100,0.12)", 
              color: isArduinoFullyOnline ? "#00ff88" : isArduinoPending ? "#ffb700" : "#8fa0c5" 
            }}>
              <Volume2 size={18} />
            </div>
            <div>
              <div className="status-card-label">Hardware Alert System</div>
              <div className={"status-badge " + (isArduinoFullyOnline ? "status-badge-online" : isArduinoPending ? "status-badge-warning" : "status-badge-offline")}>
                <span className={"sys-status-dot " + (isArduinoFullyOnline ? "dot-green" : isArduinoPending ? "dot-orange" : "dot-gray")} />
                {isArduinoFullyOnline ? "Alerts Armed" : isArduinoPending ? "Initializing..." : "Hardware Offline"}
              </div>
            </div>
          </div>
          <div className="status-card-desc">LED D7 (220Ω) + Buzzer D6 · Automated face detection triggers</div>
        </div>

      </div>

      {/* Activity Section: Timeline + Recent Logs */}
      <div className="section-label">
        <Activity size={14} style={{ color: "var(--color-cyan)" }} />
        <span>Activity Overview</span>
      </div>
      <div className="two-column-layout">

        <div className="glass-panel" style={{ padding: "32px 28px" }}>
          <h3 className="panel-section-title">
            <Activity size={18} style={{ color: "var(--color-cyan)" }} />
            Access Event Timeline
          </h3>
          <div className="bar-chart-container">
            {[15, 25, 12, 35, 48, 24, 10, 18, 42, 30, 20, 25].map((val, idx) => (
              <div key={idx} className="bar-chart-col">
                <div className="bar-chart-bar" style={{ height: val + "%" }} />
                <span className="bar-chart-label">{idx + 13}:00</span>
              </div>
            ))}
          </div>
          <div className="bar-chart-legend">
            <span>Hourly face scan event density</span>
            <span style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-cyan)", display: "inline-block" }} /> Authorized
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-red)", display: "inline-block" }} /> Unauthorized
              </span>
            </span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: "32px 28px", display: "flex", flexDirection: "column" }}>
          <h3 className="panel-section-title">
            <Shield size={18} style={{ color: "var(--color-cyan)" }} />
            Recent Detection Logs
          </h3>
          <div className="recent-logs-list">
            {recentLogs.length === 0 ? (
              <div className="empty-logs-state">
                <Shield size={36} style={{ color: "var(--text-muted)", marginBottom: "12px" }} />
                <div style={{ fontFamily: "Orbitron", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  No detection events recorded yet.
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "8px" }}>
                  Start Live Monitoring to begin scanning.
                </div>
              </div>
            ) : (
              recentLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="log-entry-row">
                  <div className={"log-status-dot " + (log.status === "Authorized" ? "dot-green" : "dot-red")} />
                  <div className="log-entry-content">
                    <div className="log-entry-name">
                      {log.status === "Authorized" ? ("✓ " + log.name) : "⚠ Unauthorized Person"}
                    </div>
                    <div className="log-entry-meta">
                      {log.status === "Authorized" ? "Access Granted" : "Access Denied"} · {log.time} · {log.confidence}% conf
                    </div>
                  </div>
                  <div className={"cyber-badge " + (log.status === "Authorized" ? "badge-authorized" : "badge-unknown")}>
                    {log.status === "Authorized" ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
                    {log.status}
                  </div>
                </div>
              ))
            )}
          </div>
          {recentLogs.length > 0 && (
            <button className="btn-3d btn-secondary view-all-btn" onClick={() => onNavigate("logs")}>
              View All Detection Logs →
            </button>
          )}
        </div>

      </div>

      {/* About VisionGuard Use Cases */}
      <div className="section-label">
        <Shield size={14} style={{ color: "var(--color-cyan)" }} />
        <span>About VisionGuard</span>
      </div>
      <div className="glass-panel about-panel">
        <div className="about-header">
          <h3 className="about-title">
            <Shield size={20} style={{ color: "var(--color-cyan)" }} />
            VisionGuard AI Access Control System
          </h3>
          <p className="about-description">
            VisionGuard is an AI-powered Face Recognition and Access Control System that monitors entry into
            restricted areas, recognizes authorized users, identifies unauthorized individuals, maintains
            real-time access logs, and generates security alerts based on configurable security policies.
          </p>
        </div>
        <div className="use-cases-grid">
          {[
            { icon: "🏦", label: "Bank Vaults & Cash Rooms", desc: "Restrict access to authorized staff only" },
            { icon: "🏢", label: "Office Server Rooms", desc: "Allow only authorized IT personnel entry" },
            { icon: "🏫", label: "College Laboratories", desc: "Restrict labs to authorized students and faculty" },
            { icon: "🏥", label: "Hospital Medicine Storage", desc: "Authorize only medical staff access" },
            { icon: "🏭", label: "Factory Control Rooms", desc: "Recognize authorized engineers and supervisors" },
            { icon: "🖥️", label: "Data Centers", desc: "Secure critical IT infrastructure access" },
            { icon: "💵", label: "Cash Rooms", desc: "Only authorized bank employees can access" },
            { icon: "🏨", label: "Hotel Staff-Only Zones", desc: "Restrict access to registered hotel staff" },
          ].map((item) => (
            <div key={item.label} className="glass-panel use-case-card">
              <div className="use-case-icon">{item.icon}</div>
              <div className="use-case-label">{item.label}</div>
              <div className="use-case-desc">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
