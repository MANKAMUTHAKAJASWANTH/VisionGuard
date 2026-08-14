package com.visionguard.api.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "registered_users")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    private String id;
    
    private String name;
    private String role;
    
    @Column(columnDefinition = "TEXT")
    private String photoUrl; // Profile snapshot base64
    
    private String regDate;
    
    @Column(columnDefinition = "TEXT")
    private String faceEmbedding; // Serialized JSON array of 128 floats
    
    private int totalCapturedImages;

    @com.fasterxml.jackson.annotation.JsonProperty("registration_timestamp")
    private String registrationTimestamp;
    
    @com.fasterxml.jackson.annotation.JsonProperty("created_at")
    private String createdAt;
    
    @com.fasterxml.jackson.annotation.JsonProperty("updated_at")
    private String updatedAt;
    
    @com.fasterxml.jackson.annotation.JsonProperty("is_enrolled")
    private Boolean isEnrolled;
    
    @com.fasterxml.jackson.annotation.JsonProperty("enrollment_type")
    private String enrollmentType;
    
    @com.fasterxml.jackson.annotation.JsonProperty("last_recognized_at")
    private String lastRecognizedAt;
    
    @com.fasterxml.jackson.annotation.JsonProperty("updated_by")
    private String updatedBy;

    // Upgraded Production Fields
    @com.fasterxml.jackson.annotation.JsonProperty("profile_photo")
    private String profilePhoto;

    @com.fasterxml.jackson.annotation.JsonProperty("email")
    private String email;

    @com.fasterxml.jackson.annotation.JsonProperty("phone")
    private String phone;

    @com.fasterxml.jackson.annotation.JsonProperty("status")
    private String status;

    @com.fasterxml.jackson.annotation.JsonProperty("registrationDate")
    private String registrationDate;

    @com.fasterxml.jackson.annotation.JsonProperty("registrationTime")
    private String registrationTime;

    @com.fasterxml.jackson.annotation.JsonProperty("lastUpdatedDate")
    private String lastUpdatedDate;

    @com.fasterxml.jackson.annotation.JsonProperty("lastUpdatedTime")
    private String lastUpdatedTime;

    @Column(name = "face_images", columnDefinition = "TEXT")
    @com.fasterxml.jackson.annotation.JsonProperty("face_images")
    private String faceImages;

    @com.fasterxml.jackson.annotation.JsonProperty("gender")
    private String gender;

    @com.fasterxml.jackson.annotation.JsonProperty("age")
    private Integer age;

    @com.fasterxml.jackson.annotation.JsonProperty("designation")
    private String designation;

    @com.fasterxml.jackson.annotation.JsonProperty("department")
    private String department;

    @com.fasterxml.jackson.annotation.JsonProperty("registration_date")
    private String registration_date;

    @com.fasterxml.jackson.annotation.JsonProperty("registration_time")
    private String registration_time;

    @com.fasterxml.jackson.annotation.JsonProperty("last_updated_date")
    private String last_updated_date;

    @com.fasterxml.jackson.annotation.JsonProperty("last_updated_time")
    private String last_updated_time;
}

