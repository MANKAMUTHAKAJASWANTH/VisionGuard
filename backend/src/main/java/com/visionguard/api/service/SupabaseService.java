package com.visionguard.api.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.visionguard.api.model.DetectionLog;
import com.visionguard.api.model.SystemSettings;
import com.visionguard.api.model.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Optional;

@Service
public class SupabaseService {

    @Value("${supabase.url:}")
    private String supabaseUrl;

    @Value("${supabase.service-role-key:}")
    private String serviceRoleKey;

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper objectMapper = new ObjectMapper()
            .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    public void validateCredentials() {
        if (supabaseUrl == null || supabaseUrl.trim().isEmpty() || 
            supabaseUrl.contains("your-project-id") ||
            serviceRoleKey == null || serviceRoleKey.trim().isEmpty()) {
            throw new IllegalStateException("Supabase configuration error: Project URL or Service Role Key is missing or invalid.");
        }
    }

    private HttpRequest.Builder createRequestBuilder(String endpoint) {
        validateCredentials();
        String cleanUrl = supabaseUrl.endsWith("/") ? supabaseUrl : supabaseUrl + "/";
        String url = cleanUrl + "rest/v1/" + endpoint;
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("apikey", serviceRoleKey)
                .header("Authorization", "Bearer " + serviceRoleKey)
                .header("Content-Type", "application/json")
                .header("Prefer", "return=representation")
                .timeout(java.time.Duration.ofSeconds(15));
    }

    // --- Registered Users ---
    public List<User> getUsers() {
        try {
            HttpRequest request = createRequestBuilder("registered_users?select=*")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401 || response.statusCode() == 403) {
                throw new IllegalStateException("Supabase connection unauthorized. Verify your Service Role Key.");
            }
            if (response.statusCode() != 200) {
                throw new RuntimeException("Supabase fetch failed: HTTP " + response.statusCode() + " - " + response.body());
            }
            return objectMapper.readValue(response.body(), new TypeReference<List<User>>() {});
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Error communicating with Supabase users endpoint: " + e.getMessage(), e);
        }
    }

    public User saveUser(User user) {
        try {
            // Build a complete payload with all valid registered_users columns.
            java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
            payload.put("id", user.getId());
            if (user.getName() != null)              payload.put("name",                 user.getName());
            if (user.getRole() != null)              payload.put("role",                 user.getRole());
            if (user.getPhotoUrl() != null)          payload.put("photoUrl",             user.getPhotoUrl());
            if (user.getRegDate() != null)           payload.put("regDate",              user.getRegDate());
            if (user.getFaceEmbedding() != null)     payload.put("faceEmbedding",        user.getFaceEmbedding());
            payload.put("totalCapturedImages", user.getTotalCapturedImages());
            if (user.getEnrollmentType() != null)    payload.put("enrollment_type",      user.getEnrollmentType());
            if (user.getIsEnrolled() != null)        payload.put("is_enrolled",          user.getIsEnrolled());
            if (user.getUpdatedBy() != null)         payload.put("updated_by",           user.getUpdatedBy());
            
            // Production fields
            if (user.getProfilePhoto() != null)      payload.put("profile_photo",        user.getProfilePhoto());
            if (user.getEmail() != null)             payload.put("email",                user.getEmail());
            if (user.getPhone() != null)             payload.put("phone",                user.getPhone());
            if (user.getStatus() != null)            payload.put("status",               user.getStatus());
            if (user.getRegistrationDate() != null)  payload.put("registrationDate",     user.getRegistrationDate());
            if (user.getRegistrationTime() != null)  payload.put("registrationTime",     user.getRegistrationTime());
            if (user.getLastUpdatedDate() != null)   payload.put("lastUpdatedDate",      user.getLastUpdatedDate());
            if (user.getLastUpdatedTime() != null)   payload.put("lastUpdatedTime",      user.getLastUpdatedTime());
            if (user.getFaceImages() != null)        payload.put("face_images",          user.getFaceImages());
            if (user.getGender() != null)            payload.put("gender",               user.getGender());
            if (user.getAge() != null)               payload.put("age",                  user.getAge());
            if (user.getDesignation() != null)       payload.put("designation",          user.getDesignation());
            if (user.getDepartment() != null)        payload.put("department",           user.getDepartment());
            if (user.getRegistration_date() != null) payload.put("registration_date",    user.getRegistration_date());
            if (user.getRegistration_time() != null) payload.put("registration_time",    user.getRegistration_time());
            if (user.getLast_updated_date() != null) payload.put("last_updated_date",    user.getLast_updated_date());
            if (user.getLast_updated_time() != null) payload.put("last_updated_time",    user.getLast_updated_time());


            String json = objectMapper.writeValueAsString(payload);
            HttpRequest request = createRequestBuilder("registered_users")
                    .header("Prefer", "resolution=merge-duplicates,return=representation")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401 || response.statusCode() == 403) {
                throw new IllegalStateException("Supabase connection unauthorized. Verify your Service Role Key.");
            }
            if (response.statusCode() != 200 && response.statusCode() != 201) {
                throw new RuntimeException("Supabase save failed: HTTP " + response.statusCode() + " - " + response.body());
            }
            List<User> list = objectMapper.readValue(response.body(), new TypeReference<List<User>>() {});
            return list.isEmpty() ? user : list.get(0);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Error saving user to Supabase: " + e.getMessage(), e);
        }
    }

    public boolean existsUserById(String id) {
        try {
            HttpRequest request = createRequestBuilder("registered_users?select=id&id=eq." + id)
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) return false;
            List<?> list = objectMapper.readValue(response.body(), List.class);
            return !list.isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    public void deleteUserById(String id) {
        try {
            HttpRequest request = createRequestBuilder("registered_users?id=eq." + id)
                    .DELETE()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401 || response.statusCode() == 403) {
                throw new IllegalStateException("Supabase connection unauthorized. Verify your Service Role Key.");
            }
            if (response.statusCode() != 200 && response.statusCode() != 204) {
                throw new RuntimeException("Supabase delete failed: HTTP " + response.statusCode());
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Error deleting user from Supabase: " + e.getMessage(), e);
        }
    }

    // --- Detection Logs ---
    public List<DetectionLog> getLogs() {
        try {
            HttpRequest request = createRequestBuilder("detection_logs?select=*&order=log_timestamp.desc&limit=500")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401 || response.statusCode() == 403) {
                throw new IllegalStateException("Supabase connection unauthorized. Verify your Service Role Key.");
            }
            if (response.statusCode() != 200) {
                throw new RuntimeException("Supabase fetch logs failed: HTTP " + response.statusCode());
            }
            return objectMapper.readValue(response.body(), new TypeReference<List<DetectionLog>>() {});
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Error communicating with Supabase logs endpoint: " + e.getMessage(), e);
        }
    }

    public DetectionLog saveLog(DetectionLog log) {
        try {
            // Build a complete payload with all valid detection_logs columns.
            java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
            payload.put("id", log.getId());
            if (log.getName() != null)          payload.put("name",          log.getName());
            if (log.getStatus() != null)        payload.put("status",        log.getStatus());
            if (log.getDate() != null)          payload.put("date",          log.getDate());
            if (log.getTime() != null)          payload.put("time",          log.getTime());
            payload.put("confidence", log.getConfidence());
            if (log.getPhotoUrl() != null)      payload.put("photoUrl",      log.getPhotoUrl());
            
            // Only set user_id when it is a real reference (non-blank) to avoid FK violation
            if (log.getUserId() != null && !log.getUserId().isBlank()) {
                payload.put("user_id", log.getUserId());
            }
            
            // Production fields
            if (log.getUserId() != null)        payload.put("userId",        log.getUserId());
            if (log.getDetectedName() != null)  payload.put("detectedName",  log.getDetectedName());
            if (log.getSnapshotUrl() != null)  payload.put("snapshotUrl",  log.getSnapshotUrl());
            if (log.getCameraName() != null)    payload.put("cameraName",    log.getCameraName());
            if (log.getDetectionDate() != null) payload.put("detectionDate", log.getDetectionDate());
            if (log.getDetectionTime() != null) payload.put("detectionTime", log.getDetectionTime());

            String json = objectMapper.writeValueAsString(payload);
            HttpRequest request = createRequestBuilder("detection_logs")
                    .header("Prefer", "resolution=merge-duplicates,return=representation")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401 || response.statusCode() == 403) {
                throw new IllegalStateException("Supabase connection unauthorized. Verify your Service Role Key.");
            }
            if (response.statusCode() != 200 && response.statusCode() != 201) {
                throw new RuntimeException("Supabase save log failed: HTTP " + response.statusCode() + " - " + response.body());
            }
            List<DetectionLog> list = objectMapper.readValue(response.body(), new TypeReference<List<DetectionLog>>() {});
            return list.isEmpty() ? log : list.get(0);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Error saving log to Supabase: " + e.getMessage(), e);
        }
    }

    public void clearLogs() {
        try {
            HttpRequest request = createRequestBuilder("detection_logs?id=neq.null")
                    .DELETE()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401 || response.statusCode() == 403) {
                throw new IllegalStateException("Supabase connection unauthorized. Verify your Service Role Key.");
            }
            if (response.statusCode() != 200 && response.statusCode() != 204) {
                throw new RuntimeException("Supabase clear logs failed: HTTP " + response.statusCode());
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Error clearing logs from Supabase: " + e.getMessage(), e);
        }
    }

    // --- System Settings ---
    public Optional<SystemSettings> getSettings() {
        try {
            HttpRequest request = createRequestBuilder("system_settings?select=*&id=eq.default")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401 || response.statusCode() == 403) {
                throw new IllegalStateException("Supabase connection unauthorized. Verify your Service Role Key.");
            }
            if (response.statusCode() != 200) return Optional.empty();
            List<SystemSettings> list = objectMapper.readValue(response.body(), new TypeReference<List<SystemSettings>>() {});
            return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public SystemSettings saveSettings(SystemSettings settings) {
        try {
            // Build a minimal payload with ONLY the columns that exist in system_settings.
            // Extra model fields (monitoringStatus, databaseStatus, etc.) are not in the DB.
            java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
            payload.put("id",                  settings.getId() != null ? settings.getId() : "default");
            if (settings.getCameraSource() != null)   payload.put("cameraSource",         settings.getCameraSource());
            if (settings.getComPort() != null)         payload.put("comPort",              settings.getComPort());
            payload.put("alarmSound",           settings.isAlarmSound());
            payload.put("confidenceThreshold",  settings.getConfidenceThreshold());
            payload.put("arduinoConnected",     settings.isArduinoConnected());
            if (settings.getThemeMode() != null)       payload.put("themeMode",            settings.getThemeMode());
            payload.put("security_mode",        settings.isSecurityMode());
            // Extended columns added via migration
            if (settings.getCameraStatus() != null)    payload.put("camera_status",        settings.getCameraStatus());
            if (settings.getCameraResolution() != null) payload.put("camera_resolution",   settings.getCameraResolution());
            if (settings.getCameraFps() != null)       payload.put("camera_fps",           settings.getCameraFps());
            if (settings.getArduinoStatus() != null)   payload.put("arduino_status",       settings.getArduinoStatus());
            if (settings.getArduinoPort() != null)     payload.put("arduino_port",         settings.getArduinoPort());
            if (settings.getArduinoBaudrate() != null) payload.put("arduino_baudrate",     settings.getArduinoBaudrate());
            if (settings.getAiModelStatus() != null)   payload.put("ai_model_status",      settings.getAiModelStatus());
            if (settings.getAiModelName() != null)     payload.put("ai_model_name",        settings.getAiModelName());
            if (settings.getAiModelVersion() != null)  payload.put("ai_model_version",     settings.getAiModelVersion());

            String json = objectMapper.writeValueAsString(payload);
            HttpRequest request = createRequestBuilder("system_settings")
                    .header("Prefer", "resolution=merge-duplicates,return=representation")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401 || response.statusCode() == 403) {
                throw new IllegalStateException("Supabase connection unauthorized. Verify your Service Role Key.");
            }
            if (response.statusCode() != 200 && response.statusCode() != 201) {
                throw new RuntimeException("Supabase save settings failed: HTTP " + response.statusCode() + " - " + response.body());
            }
            List<SystemSettings> list = objectMapper.readValue(response.body(), new TypeReference<List<SystemSettings>>() {});
            return list.isEmpty() ? settings : list.get(0);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Error saving settings to Supabase: " + e.getMessage(), e);
        }
    }
}
