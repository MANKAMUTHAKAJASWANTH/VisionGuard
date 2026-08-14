import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  Download, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  CheckCircle,
  AlertOctagon,
  X
} from 'lucide-react';

interface Log {
  id: string;
  name: string;
  status: string;
  date: string;
  time: string;
  confidence: number;
  photoUrl?: string;
  user_id?: string;
  userId?: string;
  designation?: string;
  camera_id?: string;
  log_timestamp?: string;
  spoof_detected?: boolean | string;
  multiple_persons?: boolean | string;
  multiple_faces?: boolean | string;
  spoof_reason?: string | null;
  liveness_score?: number | null;
  face_count?: number;
}

interface DetectionLogsProps {
  logs: Log[];
  onDeleteLog?: (id: string) => void;
}

export const DetectionLogs: React.FC<DetectionLogsProps> = ({ logs, onDeleteLog }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All'); // All, Today, Yesterday, Last7Days, ThisMonth, Custom
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const handleDeleteLog = (id: string) => {
    if (window.confirm("Are you sure you want to permanently delete this detection log?")) {
      if (onDeleteLog) onDeleteLog(id);
    }
  };

  // Robust DateTime parser matching our format e.g., "06 Jul 2026", "Jul 3, 2026", "07:45:32 PM"
  const parseDateTime = (dStr: string, tStr: string) => {
    try {
      if (!dStr || !tStr) return 0;
      
      let day = 1;
      let month = 0;
      let year = new Date().getFullYear();
      
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      
      // Clean up string (remove commas)
      const cleanDStr = dStr.replace(/,/g, '').trim();
      const dateParts = cleanDStr.split(/\s+/);
      
      if (dateParts.length >= 3) {
        // Format 1: 06 Jul 2026 (day is first)
        if (/^\d+$/.test(dateParts[0])) {
          day = parseInt(dateParts[0]);
          month = monthNames.indexOf(dateParts[1]);
          year = parseInt(dateParts[2]);
        } 
        // Format 2: Jul 3 2026 (month is first)
        else {
          month = monthNames.indexOf(dateParts[0]);
          day = parseInt(dateParts[1]);
          year = parseInt(dateParts[2]);
        }
      }
      
      if (month === -1) month = 0;
      if (isNaN(day)) day = 1;
      if (isNaN(year)) year = new Date().getFullYear();

      const timeMatch = tStr.match(/(\d+):(\d+):(\d+)\s*(AM|PM)/i);
      if (timeMatch) {
        let hrs = parseInt(timeMatch[1]);
        const mins = parseInt(timeMatch[2]);
        const secs = parseInt(timeMatch[3]);
        const isPM = timeMatch[4].toUpperCase() === 'PM';
        if (isPM && hrs < 12) hrs += 12;
        if (!isPM && hrs === 12) hrs = 0;
        return new Date(year, month, day, hrs, mins, secs).getTime();
      } else {
        // Try HH:MM:SS simple format
        const simpleMatch = tStr.match(/(\d+):(\d+):(\d+)/);
        if (simpleMatch) {
          const hrs = parseInt(simpleMatch[1]);
          const mins = parseInt(simpleMatch[2]);
          const secs = parseInt(simpleMatch[3]);
          return new Date(year, month, day, hrs, mins, secs).getTime();
        }
      }
    } catch (e) {
      console.warn("[VisionGuard Time] parseDateTime failed:", e);
    }
    return 0;
  };

  // Helper filter by date ranges
  const filterByDateRange = (logDate: string) => {
    const logTime = parseDateTime(logDate, "12:00:00 AM");
    if (!logTime) return true;
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (dateFilter === 'All') return true;
    if (dateFilter === 'Today') {
      return logTime >= todayStart;
    }
    if (dateFilter === 'Yesterday') {
      const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
      return logTime >= yesterdayStart && logTime < todayStart;
    }
    if (dateFilter === 'Last7Days') {
      const sevenDaysAgo = todayStart - 7 * 24 * 60 * 60 * 1000;
      return logTime >= sevenDaysAgo;
    }
    if (dateFilter === 'ThisMonth') {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return logTime >= firstOfMonth;
    }
    if (dateFilter === 'Custom' && startDate) {
      const start = new Date(startDate).getTime();
      const end = endDate ? new Date(endDate).getTime() + 24 * 60 * 60 * 1000 : todayStart + 24 * 60 * 60 * 1000;
      return logTime >= start && logTime < end;
    }
    return true;
  };

  // Memoized filter and automatic sorting by newest first
  const filteredLogs = useMemo(() => {
    const filtered = logs.filter((log) => {
      // Search matches Name, Employee ID (user_id), Status, or Date
      const s = searchTerm.toLowerCase();
      const matchesSearch = 
        log.name.toLowerCase().includes(s) ||
        (log.user_id && log.user_id.toLowerCase().includes(s)) ||
        log.id.toLowerCase().includes(s) ||
        log.status.toLowerCase().includes(s) ||
        log.date.toLowerCase().includes(s);

      const matchesStatus = statusFilter === 'All' ||
        log.status.toLowerCase().includes(statusFilter.toLowerCase()) ||
        (statusFilter === 'Security Alert' && log.status !== 'Authorized');

      const matchesDate = filterByDateRange(log.date);

      return matchesSearch && matchesStatus && matchesDate;
    });

    // Auto sort: newest first
    return filtered.sort((a, b) => {
      const timeA = parseDateTime(a.date, a.time);
      const timeB = parseDateTime(b.date, b.time);
      return timeB - timeA;
    });
  }, [logs, searchTerm, statusFilter, dateFilter, startDate, endDate]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const indexOfLastItem = safeCurrentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredLogs.slice(indexOfFirstItem, indexOfLastItem);

  // Helper to change page safely
  const changePage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Reset to page 1 when filters change (handled inline on inputs)

  // CSV Export Utility
  const handleExportCSV = () => {
    if (logs.length === 0) return;
    
    const headers = ['Log ID', 'Name', 'Status', 'Date', 'Time', 'Confidence (%)'];
    const csvRows = [headers.join(',')];
    
    logs.forEach(log => {
      const row = [
        log.id,
        `"${log.name}"`,
        log.status,
        log.date,
        log.time,
        `${log.confidence}%`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `visionguard_detection_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fade-in glass-panel" style={{ padding: '24px' }}>
      
      {/* Table Toolbar controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap',
        marginBottom: '24px'
      }}>
        
        {/* Title */}
        <div>
          <h3 style={{ fontFamily: 'Orbitron', fontSize: '1.2rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} style={{ color: 'var(--color-cyan)' }} />
            Access Control Detection Log
          </h3>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Real-time face recognition access event history and security audit trail
          </span>
        </div>

        {/* Filters and search panel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          
          {/* Search box */}
          <div style={{ position: 'relative', width: '240px' }}>
            <input 
              type="text" 
              className="cyber-input" 
              placeholder="Search Name/ID/Status/Date..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              style={{ padding: '10px 14px 10px 38px', fontSize: '0.85rem' }}
            />
            <Search size={14} style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }} />
          </div>

          {/* Status Dropdown */}
          <div style={{ position: 'relative' }}>
            <select 
              className="cyber-input cyber-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              style={{ padding: '10px 38px 10px 14px', fontSize: '0.85rem', width: '180px' }}
            >
              <option value="All">All Statuses</option>
              <option value="Authorized">Authorized</option>
              <option value="Unauthorized">Unauthorized</option>
              <option value="SPOOF ATTACK DETECTED">Spoof Attacks</option>
              <option value="MULTIPLE FACES DETECTED">Multiple Faces</option>
            </select>
          </div>

          {/* Date Range Dropdown */}
          <div style={{ position: 'relative' }}>
            <select 
              className="cyber-input cyber-select"
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
              style={{ padding: '10px 38px 10px 14px', fontSize: '0.85rem', width: '185px' }}
            >
              <option value="All">All Dates</option>
              <option value="Today">Today</option>
              <option value="Yesterday">Yesterday</option>
              <option value="Last7Days">Last 7 Days</option>
              <option value="ThisMonth">This Month</option>
              <option value="Custom">Custom Date Range</option>
            </select>
          </div>

          {/* Custom Date Range Pickers (conditional) */}
          {dateFilter === 'Custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input 
                type="date" 
                className="cyber-input" 
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                style={{ padding: '8px 12px', fontSize: '0.82rem', width: '135px' }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>to</span>
              <input 
                type="date" 
                className="cyber-input" 
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                style={{ padding: '8px 12px', fontSize: '0.82rem', width: '135px' }}
              />
            </div>
          )}

          {/* Export Button */}
          <button 
            className="btn-3d btn-cyan" 
            onClick={handleExportCSV}
            style={{ padding: '10px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={logs.length === 0}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>

      </div>

      {/* Primary Logs Table Grid */}
      <div className="cyber-table-container">
        <table className="cyber-table" style={{ tableLayout: 'auto', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '70px', textAlign: 'center' }}>Photo</th>
              <th style={{ textAlign: 'left', width: '135px' }}>Employee ID</th>
              <th style={{ textAlign: 'left', minWidth: '150px' }}>Name</th>
              <th style={{ textAlign: 'left', minWidth: '150px' }}>Designation</th>
              <th style={{ textAlign: 'center', width: '140px' }}>Status</th>
              <th style={{ textAlign: 'center', width: '110px' }}>Confidence</th>
              <th style={{ textAlign: 'left', width: '120px' }}>Date</th>
              <th style={{ textAlign: 'left', width: '120px' }}>Time</th>
              <th style={{ textAlign: 'center', width: '150px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontFamily: 'Orbitron', fontWeight: 600 }}>
                  No detection logs available.
                </td>
              </tr>
            ) : currentItems.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  No telemetry entries match the active criteria.
                </td>
              </tr>
            ) : (
              currentItems.map((log) => {
                const normalizedStatus = log.status ? log.status.toUpperCase() : '';
                const isAuthorized = normalizedStatus.includes('AUTHORIZED') && !normalizedStatus.includes('UNAUTHORIZED');
                const isSpoof = normalizedStatus.includes('SPOOF');
                const isMultiple = normalizedStatus.includes('MULTIPLE');
                
                const getStatusBorderColor = () => {
                  if (isAuthorized) return 'var(--color-emerald)';
                  if (isSpoof) return '#ff5500';
                  if (isMultiple) return '#eab308';
                  return 'var(--color-red)';
                };

                const getConfidenceTextColor = () => {
                  if (isAuthorized) return 'var(--color-emerald)';
                  if (isSpoof) return '#ff5500';
                  if (isMultiple) return '#eab308';
                  return 'var(--color-red)';
                };

                return (
                  <tr 
                    key={log.id} 
                    style={{ cursor: 'pointer', height: '64px' }} 
                    onClick={() => setSelectedLog(log)}
                    className="cyber-table-row"
                  >
                    {/* PHOTO */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      {log.photoUrl ? (
                        <img 
                          src={log.photoUrl} 
                          alt={log.name} 
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            border: `2px solid ${getStatusBorderColor()}`,
                            objectFit: 'cover'
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1.5px solid var(--border-glass)',
                          margin: '0 auto'
                        }} />
                      )}
                    </td>
                    
                    {/* EMPLOYEE ID */}
                    <td style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8rem', color: 'var(--color-cyan)', fontWeight: 600, verticalAlign: 'middle' }}>
                      {log.user_id || log.userId || 'N/A'}
                    </td>

                    {/* NAME */}
                    <td 
                      title={log.name}
                      style={{ fontWeight: 600, color: 'var(--text-main)', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}
                    >
                      {log.name}
                    </td>

                    {/* DESIGNATION */}
                    <td 
                      title={log.designation || 'Visitor'}
                      style={{ color: 'var(--text-muted)', verticalAlign: 'middle', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}
                    >
                      {log.designation || 'Visitor'}
                    </td>

                    {/* STATUS */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      {isAuthorized ? (
                        <span className="cyber-badge badge-authorized" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle size={10} />
                          Authorized
                        </span>
                      ) : isSpoof ? (
                        <span className="cyber-badge" style={{ background: 'rgba(255, 85, 0, 0.1)', color: '#ff5500', border: '1px solid #ff5500', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600 }}>
                          <AlertOctagon size={10} />
                          Spoof Attack
                        </span>
                      ) : isMultiple ? (
                        <span className="cyber-badge" style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', border: '1px solid #eab308', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600 }}>
                          <AlertOctagon size={10} />
                          Multiple Faces
                        </span>
                      ) : (
                        <span className="cyber-badge badge-unknown" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <AlertOctagon size={10} />
                          Unauthorized
                        </span>
                      )}
                    </td>

                    {/* CONFIDENCE */}
                    <td style={{ 
                      textAlign: 'center', 
                      fontWeight: 700, 
                      color: getConfidenceTextColor(),
                      fontFamily: 'Orbitron',
                      fontSize: '0.85rem',
                      verticalAlign: 'middle'
                    }}>
                      {log.confidence}%
                    </td>

                    {/* DATE */}
                    <td style={{ verticalAlign: 'middle', color: 'var(--text-main)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                      {log.date}
                    </td>

                    {/* TIME */}
                    <td style={{ verticalAlign: 'middle', color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {log.time}
                    </td>

                    {/* ACTIONS */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button 
                          className="btn-3d btn-secondary" 
                          style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '10px' }}
                          onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}
                        >
                          View
                        </button>
                        <button 
                          className="btn-3d btn-red" 
                          style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '10px' }}
                          onClick={(e) => { e.stopPropagation(); handleDeleteLog(log.id); }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination control panel */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '20px',
        color: 'var(--text-muted)',
        fontSize: '0.85rem',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <span>
          Showing {indexOfFirstItem + 1} - {Math.min(indexOfLastItem, filteredLogs.length)} of {filteredLogs.length} events
        </span>

        <div style={{ display: 'flex', gap: '6px' }}>
          
          <button 
            className="btn-3d btn-secondary" 
            style={{ padding: '8px' }}
            onClick={() => changePage(1)}
            disabled={currentPage === 1}
          >
            <ChevronsLeft size={14} />
          </button>
          
          <button 
            className="btn-3d btn-secondary" 
            style={{ padding: '8px' }}
            onClick={() => changePage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft size={14} />
          </button>

          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 16px',
            border: '1px solid var(--border-glass)',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.02)',
            fontFamily: 'Orbitron',
            fontSize: '0.8rem',
            color: '#ffffff'
          }}>
            {currentPage} / {totalPages}
          </span>

          <button 
            className="btn-3d btn-secondary" 
            style={{ padding: '8px' }}
            onClick={() => changePage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            <ChevronRight size={14} />
          </button>

          <button 
            className="btn-3d btn-secondary" 
            style={{ padding: '8px' }}
            onClick={() => changePage(totalPages)}
            disabled={currentPage === totalPages}
          >
            <ChevronsRight size={14} />
          </button>

        </div>
      </div>

      {/* ── Full Details Modal ─────────────────────────────── */}
      {selectedLog && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(5, 5, 21, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 3000, padding: '20px'
        }}>
          <div className="glass-panel fade-in" style={{
            width: '100%', maxWidth: '480px', padding: '32px',
            border: '1.5px solid var(--border-glass-glow)',
            boxShadow: '0 0 40px rgba(0, 243, 255, 0.15)',
            position: 'relative'
          }}>
            {/* Close Button */}
            <button 
              onClick={() => setSelectedLog(null)}
              style={{
                position: 'absolute', right: '20px', top: '20px',
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', display: 'flex', padding: '6px',
                borderRadius: '50%', transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
            >
              <X size={16} />
            </button>

            <h3 style={{ fontFamily: 'Orbitron', color: '#ffffff', fontSize: '1.1rem', marginBottom: '20px', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} style={{ color: 'var(--color-cyan)' }} />
              Security Access Log Details
            </h3>

            {/* Large Snapshot */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              {selectedLog.photoUrl ? (
                <img 
                  src={selectedLog.photoUrl} 
                  alt={selectedLog.name} 
                  style={{
                    width: '180px', height: '180px', borderRadius: '16px',
                    border: `2px solid ${
                      selectedLog.status.toUpperCase().includes('AUTHORIZED') && !selectedLog.status.toUpperCase().includes('UNAUTHORIZED') ? 'var(--color-emerald)' : 
                      selectedLog.status.toUpperCase().includes('SPOOF') ? '#ff5500' :
                      selectedLog.status.toUpperCase().includes('MULTIPLE') ? '#eab308' :
                      'var(--color-red)'
                    }`,
                    objectFit: 'cover', boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                  }}
                />
              ) : (
                <div style={{
                  width: '180px', height: '180px', borderRadius: '16px',
                  background: 'rgba(255,255,255,0.02)', border: '1.5px dashed var(--border-glass)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto'
                }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No Snapshot Available</span>
                </div>
              )}
            </div>

            {/* Detail Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '28px', fontSize: '0.9rem' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Detection ID</span>
                <span style={{ fontFamily: 'JetBrains Mono', color: '#ffffff', fontSize: '0.82rem' }}>{selectedLog.id}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Employee ID</span>
                <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--color-cyan)', fontWeight: 600 }}>{selectedLog.user_id || selectedLog.userId || 'N/A'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Name</span>
                <span style={{ color: '#ffffff', fontWeight: 600 }}>{selectedLog.name}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Designation</span>
                <span style={{ color: '#ffffff' }}>{selectedLog.designation || 'Visitor / Unknown'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Detection Status</span>
                <span>
                  {selectedLog.status.toUpperCase().includes('AUTHORIZED') && !selectedLog.status.toUpperCase().includes('UNAUTHORIZED') ? (
                    <span style={{ color: 'var(--color-emerald)', fontWeight: 700 }}>🟢 AUTHORIZED</span>
                  ) : selectedLog.status.toUpperCase().includes('SPOOF') ? (
                    <span style={{ color: '#ff5500', fontWeight: 700 }}>🟠 SPOOF ATTACK</span>
                  ) : selectedLog.status.toUpperCase().includes('MULTIPLE') ? (
                    <span style={{ color: '#eab308', fontWeight: 700 }}>🟡 MULTIPLE FACES DETECTED</span>
                  ) : (
                    <span style={{ color: 'var(--color-red)', fontWeight: 700 }}>🔴 UNAUTHORIZED</span>
                  )}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Match Confidence</span>
                <span style={{ fontFamily: 'Orbitron', fontWeight: 700, color: 'var(--color-cyan)' }}>{selectedLog.confidence}%</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Camera Source</span>
                <span style={{ color: '#ffffff' }}>{selectedLog.camera_id || 'Camera #1'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Date</span>
                <span style={{ color: '#ffffff', fontWeight: 550 }}>{selectedLog.date}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Time</span>
                <span style={{ color: '#ffffff', fontWeight: 550 }}>{selectedLog.time}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Spoof Attack Detected</span>
                <span style={{ color: (selectedLog.spoof_detected === 'Yes' || selectedLog.spoof_detected === true) ? '#ff5500' : 'var(--color-emerald)', fontWeight: 600 }}>
                  {(selectedLog.spoof_detected === 'Yes' || selectedLog.spoof_detected === true) ? 'Yes' : 'No'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Multiple Persons Detected</span>
                <span style={{ color: (selectedLog.multiple_persons === 'Yes' || selectedLog.multiple_persons === true || selectedLog.multiple_faces === true) ? '#eab308' : 'var(--color-emerald)', fontWeight: 600 }}>
                  {(selectedLog.multiple_persons === 'Yes' || selectedLog.multiple_persons === true || selectedLog.multiple_faces === true) ? 'Yes' : 'No'}
                </span>
              </div>

            </div>

            <button 
              className="btn-3d btn-secondary" 
              onClick={() => setSelectedLog(null)}
              style={{ width: '100%', padding: '12px' }}
            >
              Close Record
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
