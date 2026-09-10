// API_BASE_URL reads from environment variable.
// - Local dev with Spring Boot: set VITE_API_BASE_URL=http://localhost:8080/api
// - Vercel / production: leave unset — all data goes through Supabase directly.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '';

// Returns true when a Spring Boot backend URL is configured
const isBackendConfigured = () => !!API_BASE_URL;

export interface User {
  id: string;
  name: string;
  role: string;
  photoUrl: string;
  regDate: string;
  faceEmbedding?: string; // Serialized float array
  totalCapturedImages?: number;
  
  // Upgraded Fields
  registration_timestamp?: string;
  created_at?: string;
  updated_at?: string;
  is_enrolled?: boolean;
  enrollment_type?: string;
  last_recognized_at?: string;
  updated_by?: string;

  // Upgraded Production Fields
  profile_photo?: string;
  email?: string;
  phone?: string;
  status?: string;
  registrationDate?: string;
  registrationTime?: string;
  lastUpdatedDate?: string;
  lastUpdatedTime?: string;
  face_images?: string;

  gender?: string;
  age?: number;
  designation?: string;
  department?: string;
  registration_date?: string;
  registration_time?: string;
  last_updated_date?: string;
  last_updated_time?: string;
  mobile_number?: string;
  created_by_admin_name?: string;
  created_by_admin_id?: string;
  registration_status?: string;
}

export interface Log {
  id: string;
  name: string;
  status: string;
  date: string;
  time: string;
  confidence: number;
  photoUrl?: string; // Base64 snapshot
  
  // Upgraded Fields
  log_timestamp?: string;
  created_at?: string;
  severity?: string;
  is_resolved?: boolean;
  resolved_at?: string;
  resolved_by?: string;
  notes?: string;
  raw_log_data?: any;
  user_id?: string;
  designation?: string;
  camera_id?: string;
  spoof_detected?: boolean | string;
  multiple_persons?: boolean | string;
  multiple_faces?: boolean | string;
  spoof_reason?: string | null;
  liveness_score?: number | null;
  face_count?: number;

  // Upgraded Production Fields
  userId?: string;
  detectedName?: string;
  snapshotUrl?: string;
  cameraName?: string;
  detectionDate?: string;
  detectionTime?: string;
  detected_at?: string;
  auth_method?: string;
}

export interface SystemSettings {
  cameraSource: string;
  comPort: string;
  alarmSound: boolean;
  confidenceThreshold: number;
  arduinoConnected: boolean;
  themeMode: string;
  
  // Upgraded Fields
  camera_status?: string;
  camera_resolution?: string;
  camera_fps?: number;
  arduino_status?: string;
  arduino_port?: string;
  arduino_baudrate?: number;
  ai_model_status?: string;
  ai_model_name?: string;
  ai_model_version?: string;
  created_at?: string;
  updated_at?: string;

  // Upgraded Production Fields
  cameraStatus?: string;
  monitoringStatus?: string;
  aiModelStatus?: string;
  databaseStatus?: string;
  securityMode?: boolean;
  security_mode?: boolean;
}

// Safe fetch wrapper — returns null instead of throwing when backend is offline
const safeFetch = async (url: string, options?: RequestInit): Promise<Response | null> => {
  if (!isBackendConfigured()) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch {
    return null; // Backend offline or timed out — fail silently
  }
};

export const apiService = {
  // Users API
  async getUsers(): Promise<User[]> {
    const response = await safeFetch(`${API_BASE_URL}/users?t=${Date.now()}`, { cache: 'no-store' });
    if (!response || !response.ok) return [];
    return response.json();
  },

  async registerUser(user: User): Promise<User> {
    const response = await safeFetch(`${API_BASE_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    if (!response || !response.ok) throw new Error('Backend unavailable');
    return response.json();
  },

  async updateUser(id: string, user: User): Promise<User> {
    const response = await safeFetch(`${API_BASE_URL}/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    if (!response || !response.ok) throw new Error('Backend unavailable');
    return response.json();
  },

  async revokeUser(id: string): Promise<void> {
    await safeFetch(`${API_BASE_URL}/users/${id}`, { method: 'DELETE' });
  },

  // Logs API
  async getLogs(status?: string, search?: string): Promise<Log[]> {
    let url = `${API_BASE_URL}/logs`;
    const params = new URLSearchParams();
    if (status && status !== 'All') params.append('status', status);
    if (search) params.append('search', search);
    params.append('t', Date.now().toString());
    if (params.toString()) url += `?${params.toString()}`;

    const response = await safeFetch(url, { cache: 'no-store' });
    if (!response || !response.ok) return [];
    return response.json();
  },

  async addLog(log: Omit<Log, 'id'>): Promise<Log> {
    const response = await safeFetch(`${API_BASE_URL}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log)
    });
    if (!response || !response.ok) throw new Error('Backend unavailable');
    return response.json();
  },

  async clearLogs(): Promise<void> {
    await safeFetch(`${API_BASE_URL}/logs`, { method: 'DELETE' });
  },

  // Settings API
  async getSettings(): Promise<SystemSettings> {
    const response = await safeFetch(`${API_BASE_URL}/settings?t=${Date.now()}`, { cache: 'no-store' });
    if (!response || !response.ok) throw new Error('Backend unavailable');
    return response.json();
  },

  async updateSettings(settings: SystemSettings): Promise<SystemSettings> {
    const response = await safeFetch(`${API_BASE_URL}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (!response || !response.ok) throw new Error('Backend unavailable');
    return response.json();
  }
};
