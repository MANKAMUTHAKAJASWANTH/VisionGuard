package com.visionguard.api.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "system_settings")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SystemSettings {

    @Id
    private String id = "default";
    
    private String cameraSource;
    private String comPort;
    private boolean alarmSound;
    private int confidenceThreshold;
    private boolean arduinoConnected;
    private String themeMode;

    @com.fasterxml.jackson.annotation.JsonProperty("security_mode")
    @com.fasterxml.jackson.annotation.JsonAlias({"securityMode", "security_mode"})
    private boolean securityMode;

    @com.fasterxml.jackson.annotation.JsonProperty("camera_status")
    @com.fasterxml.jackson.annotation.JsonAlias({"cameraStatus", "camera_status"})
    private String cameraStatus;
    
    @com.fasterxml.jackson.annotation.JsonProperty("camera_resolution")
    private String cameraResolution;
    
    @com.fasterxml.jackson.annotation.JsonProperty("camera_fps")
    private Integer cameraFps;
    
    @com.fasterxml.jackson.annotation.JsonProperty("arduino_status")
    private String arduinoStatus;
    
    @com.fasterxml.jackson.annotation.JsonProperty("arduino_port")
    private String arduinoPort;
    
    @com.fasterxml.jackson.annotation.JsonProperty("arduino_baudrate")
    private Integer arduinoBaudrate;
    
    @com.fasterxml.jackson.annotation.JsonProperty("ai_model_status")
    @com.fasterxml.jackson.annotation.JsonAlias({"aiModelStatus", "ai_model_status"})
    private String aiModelStatus;
    
    @com.fasterxml.jackson.annotation.JsonProperty("ai_model_name")
    private String aiModelName;
    
    @com.fasterxml.jackson.annotation.JsonProperty("ai_model_version")
    private String aiModelVersion;
    
    @com.fasterxml.jackson.annotation.JsonProperty("created_at")
    private String createdAt;
    
    @com.fasterxml.jackson.annotation.JsonProperty("updated_at")
    private String updatedAt;

    @com.fasterxml.jackson.annotation.JsonProperty("monitoringStatus")
    private String monitoringStatus;

    @com.fasterxml.jackson.annotation.JsonProperty("databaseStatus")
    private String databaseStatus;

    // Explicit constructor to maintain compatibility with existing controllers calling the original 7-arg signature
    public SystemSettings(String id, String cameraSource, String comPort, boolean alarmSound, int confidenceThreshold, boolean arduinoConnected, String themeMode) {
        this.id = id;
        this.cameraSource = cameraSource;
        this.comPort = comPort;
        this.alarmSound = alarmSound;
        this.confidenceThreshold = confidenceThreshold;
        this.arduinoConnected = arduinoConnected;
        this.themeMode = themeMode;
    }
}
