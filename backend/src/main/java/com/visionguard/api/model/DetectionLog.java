package com.visionguard.api.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "detection_logs")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DetectionLog {

    @Id
    private String id;
    
    private String name;
    private String status; // "Authorized" or "Unknown"
    private String date;
    private String time;
    private int confidence;
    
    @Column(columnDefinition = "TEXT")
    private String photoUrl; // Biometric camera feed snapshot base64

    @com.fasterxml.jackson.annotation.JsonProperty("log_timestamp")
    private String logTimestamp;
    
    @com.fasterxml.jackson.annotation.JsonProperty("created_at")
    private String createdAt;
    
    private String severity;
    
    @com.fasterxml.jackson.annotation.JsonProperty("is_resolved")
    private Boolean isResolved;
    
    @com.fasterxml.jackson.annotation.JsonProperty("resolved_at")
    private String resolvedAt;
    
    @com.fasterxml.jackson.annotation.JsonProperty("resolved_by")
    private String resolvedBy;
    
    private String notes;
    
    @com.fasterxml.jackson.annotation.JsonProperty("raw_log_data")
    private String rawLogData;
    
    @com.fasterxml.jackson.annotation.JsonProperty("user_id")
    @com.fasterxml.jackson.annotation.JsonAlias({"userId", "user_id"})
    private String userId;

    // Upgraded Production Fields

    @com.fasterxml.jackson.annotation.JsonProperty("detectedName")
    private String detectedName;

    @com.fasterxml.jackson.annotation.JsonProperty("snapshotUrl")
    private String snapshotUrl;

    @com.fasterxml.jackson.annotation.JsonProperty("cameraName")
    private String cameraName;

    @com.fasterxml.jackson.annotation.JsonProperty("detectionDate")
    private String detectionDate;

    @com.fasterxml.jackson.annotation.JsonProperty("detectionTime")
    private String detectionTime;

    @com.fasterxml.jackson.annotation.JsonProperty("detected_at")
    private String detectedAt;
}
