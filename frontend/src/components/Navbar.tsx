import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Activity, 
  UserPlus, 
  Users, 
  FileText, 
  Settings as SettingsIcon, 
  Sun, 
  Moon, 
  Bell,
  Zap,
  LogOut,
  LogIn
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isLightTheme: boolean;
  setIsLightTheme: (val: boolean) => void;
  notificationsCount: number;
  notifications: string[];
  clearNotifications: () => void;
  isLoggedIn: boolean;
  setIsLoggedIn: (val: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  isLightTheme,
  setIsLightTheme,
  notificationsCount,
  notifications,
  clearNotifications,
  isLoggedIn,
  setIsLoggedIn
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const status = isLoggedIn ? 'online' : 'offline';
  const [showDropdown, setShowDropdown] = useState(false);

  // Click outside to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.admin-profile-card') && !target.closest('.admin-dropdown-menu')) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      window.addEventListener('click', handleOutsideClick);
    }
    return () => {
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [showDropdown]);

  const toggleTheme = () => {
    setIsLightTheme(!isLightTheme);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <Shield size={18} /> },
    { id: 'register', label: 'Register User', icon: <UserPlus size={18} /> },
    { id: 'monitoring', label: 'Live Monitoring', icon: <Activity size={18} /> },
    { id: 'users', label: 'Registered Users', icon: <Users size={18} /> },
    { id: 'logs', label: 'Detection Logs', icon: <FileText size={18} /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon size={18} /> },
  ];

  return (
    <nav className="navbar-container glass-panel">
      {/* Column 1: Logo (left) */}
      <div className="logo-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', gap: '2px' }} onClick={() => setActiveTab('dashboard')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="38" height="38" viewBox="0 0 100 100" style={{ filter: 'drop-shadow(0 0 6px rgba(0, 243, 255, 0.45))', flexShrink: 0 }}>
            <defs>
              <linearGradient id="shieldMetalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="45%" stopColor="#cbd5e1" />
                <stop offset="100%" stopColor="#334155" />
              </linearGradient>
              <linearGradient id="shieldBlueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#00f3ff" />
                <stop offset="100%" stopColor="#0066ff" />
              </linearGradient>
              <radialGradient id="irisGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#000000" />
                <stop offset="35%" stopColor="#0066ff" />
                <stop offset="70%" stopColor="#00f3ff" />
                <stop offset="90%" stopColor="#0284c7" />
                <stop offset="100%" stopColor="#050515" />
              </radialGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <path d="M50 6 C70 16, 82 24, 82 52 C82 72, 70 87, 50 94 C30 87, 18 72, 18 52 C18 24, 30 16, 50 6 Z" fill="none" stroke="url(#shieldBlueGrad)" strokeWidth="4.5" />
            <path d="M50 11 C66 20, 76 27, 76 52 C76 68, 66 80, 50 87 C34 80, 24 68, 24 52 C24 27, 34 20, 50 11 Z" fill="rgba(6, 7, 24, 0.85)" stroke="url(#shieldMetalGrad)" strokeWidth="2.5" />
            <rect x="76" y="16" width="8" height="8" rx="2" fill="#00f3ff" filter="url(#glow)" />
            <rect x="85" y="19" width="6" height="6" rx="1.5" fill="#0066ff" />
            <rect x="74" y="26" width="9" height="9" rx="2.2" fill="#00f3ff" filter="url(#glow)" />
            <rect x="85" y="28" width="7" height="7" rx="1.8" fill="#0066ff" />
            <rect x="79" y="37" width="8" height="8" rx="2" fill="#00f3ff" />
            <rect x="88" y="35" width="5" height="5" rx="1.2" fill="#0066ff" />
            <path d="M28 50 Q50 21 72 50" fill="none" stroke="url(#shieldMetalGrad)" strokeWidth="3" strokeLinecap="round" />
            <path d="M28 50 Q50 79 72 50" fill="none" stroke="url(#shieldMetalGrad)" strokeWidth="3" strokeLinecap="round" />
            <circle cx="50" cy="50" r="16.5" fill="url(#irisGrad)" filter="url(#glow)" />
            <circle cx="45.5" cy="45.5" r="3.5" fill="#ffffff" opacity="0.88" />
            <circle cx="54" cy="54" r="1.8" fill="#ffffff" opacity="0.45" />
            <circle cx="50" cy="50" r="34" fill="none" stroke="#00f3ff" strokeWidth="0.8" strokeDasharray="3 6" opacity="0.32" />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '0.85' }}>
            <span className="vision-logo-text">VISION</span>
            <span className="guard-logo-text" style={{ marginTop: '1px' }}>GUARD</span>
          </div>
        </div>
        <div className="tagline-glow-wrapper">
          <div className="tagline-logo-text">
            SMARTER RECOGNITION. STRONGER SECURITY.
          </div>
        </div>
      </div>

      {/* Column 2: Nav Links (center) */}
      <ul className="nav-links">
        {navItems.map((item) => (
          <li key={item.id}>
            <button
              className={`nav-link-btn ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      {/* Column 3: Action Utilities (right) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>

        {/* Notification Bell */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn-3d btn-secondary"
            style={{ padding: '9px', borderRadius: '11px' }}
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell size={17} />
            {notificationsCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                background: 'var(--color-red)',
                color: '#ffffff',
                fontSize: '0.6rem',
                fontWeight: 700,
                width: '17px',
                height: '17px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 8px rgba(255, 59, 48, 0.6)'
              }}>
                {notificationsCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="glass-panel" style={{
              position: 'absolute',
              top: '48px',
              right: '0',
              width: '300px',
              maxHeight: '380px',
              overflowY: 'auto',
              zIndex: 101,
              padding: '14px',
              border: '1px solid var(--border-glass-glow)',
              boxShadow: '0 10px 25px rgba(0, 102, 255, 0.2)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Live Alert Feed</span>
                {notifications.length > 0 && (
                  <button
                    onClick={() => { clearNotifications(); setShowNotifications(false); }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-cyan)', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {notifications.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: '0.82rem' }}>
                    <Zap size={22} style={{ color: 'var(--text-muted)', opacity: 0.3, marginBottom: '8px' }} />
                    <p>No new system threats detected.</p>
                  </div>
                ) : (
                  notifications.map((note, idx) => (
                    <div key={idx} style={{
                      padding: '9px 10px',
                      borderRadius: '8px',
                      background: note.includes('Unknown') ? 'rgba(255, 59, 48, 0.1)' : 'rgba(0, 255, 136, 0.1)',
                      borderLeft: `3px solid ${note.includes('Unknown') ? 'var(--color-red)' : 'var(--color-emerald)'}`,
                      fontSize: '0.75rem',
                      lineHeight: '1.3'
                    }}>
                      {note}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          className="btn-3d btn-secondary"
          style={{ padding: '9px', borderRadius: '11px' }}
          onClick={toggleTheme}
        >
          {isLightTheme ? <Moon size={17} /> : <Sun size={17} />}
        </button>

        {/* User Profile Card */}
        <div className="admin-profile-card" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="btn-3d"
            style={{
              padding: '6px 12px',
              borderRadius: '12px',
              background: 'rgba(20, 25, 45, 0.85)',
              border: '1.5px solid var(--border-glass)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              textAlign: 'left',
              transition: 'all 0.2s ease-in-out',
              boxShadow: showDropdown ? '0 0 12px rgba(0, 243, 255, 0.25)' : 'none'
            }}
          >
            {/* Admin Avatar Container with Status Dot */}
            <div style={{ position: 'relative', width: '32px', height: '32px', flexShrink: 0 }}>
              <div style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #00f3ff, #0066ff)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '1rem',
                boxShadow: '0 2px 8px rgba(0, 243, 255, 0.2)'
              }}>
                👤
              </div>
              
              {/* Colored Status Dot Indicator (Online / Offline) */}
              <span className={`status-badge-dot ${status === 'online' ? 'dot-online' : ''}`} style={{
                position: 'absolute',
                bottom: '-1px',
                right: '-1px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                border: '1.5px solid #0a081e',
                background: status === 'online' ? 'var(--color-emerald)' : 'var(--color-red)',
                boxShadow: status === 'online' ? '0 0 8px rgba(0, 255, 136, 0.6)' : 'none',
                transition: 'all 0.3s ease-in-out'
              }} />
            </div>

            {/* Info Text */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: '100px' }}>
              <span style={{
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.82rem',
                lineHeight: '1.2'
              }}>
                Jaswanth
              </span>
              <span style={{
                color: 'var(--text-muted)',
                fontSize: '0.68rem',
                lineHeight: '1.2'
              }}>
                Security Administrator
              </span>
            </div>
          </button>

          {/* Inject Dynamic Keyframe Styles */}
          <style>{`
            @keyframes greenGlow {
              0% { box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.5); }
              70% { box-shadow: 0 0 0 5px rgba(0, 255, 136, 0); }
              100% { box-shadow: 0 0 0 0 rgba(0, 255, 136, 0); }
            }
            .dot-online {
              animation: greenGlow 1.8s infinite;
            }
          `}</style>

          {/* Admin Action Dropdown Menu */}
          {showDropdown && (
            <div className="admin-dropdown-menu glass-panel" style={{
              position: 'absolute',
              top: '55px',
              right: '0',
              width: '180px',
              zIndex: 150,
              padding: '8px',
              border: '1px solid var(--border-glass-glow)',
              boxShadow: '0 8px 24px rgba(0, 243, 255, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              borderRadius: '12px',
              animation: 'fadeIn 0.2s ease-in-out'
            }}>
              {isLoggedIn ? (
                <button
                  onClick={() => {
                    setIsLoggedIn(false);
                    setShowDropdown(false);
                  }}
                  className="nav-link-btn"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    textAlign: 'left',
                    color: 'var(--color-red)',
                    cursor: 'pointer'
                  }}
                >
                  <LogOut size={14} />
                  <span>Log Out</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    setActiveTab('register');
                  }}
                  className="nav-link-btn"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    textAlign: 'left',
                    color: 'var(--color-emerald)',
                    cursor: 'pointer'
                  }}
                >
                  <LogIn size={14} />
                  <span>Log In</span>
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </nav>
  );
};
