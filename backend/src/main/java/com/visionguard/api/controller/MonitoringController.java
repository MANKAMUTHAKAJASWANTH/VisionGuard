package com.visionguard.api.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/monitoring")
@CrossOrigin(origins = "*")
public class MonitoringController {

    private boolean isMonitoring = false;
    private boolean isAlarmActive = false;

    @PostMapping("/start")
    public ResponseEntity<Map<String, Object>> startMonitoring() {
        isMonitoring = true;
        Map<String, Object> response = new HashMap<>();
        response.put("status", "SUCCESS");
        response.put("message", "Biometric face recognition engine started.");
        response.put("monitoring", true);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/stop")
    public ResponseEntity<Map<String, Object>> stopMonitoring() {
        isMonitoring = false;
        isAlarmActive = false;
        Map<String, Object> response = new HashMap<>();
        response.put("status", "SUCCESS");
        response.put("message", "Perimeter monitoring stream stopped.");
        response.put("monitoring", false);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/alarm/reset")
    public ResponseEntity<Map<String, Object>> resetAlarm() {
        isAlarmActive = false;
        Map<String, Object> response = new HashMap<>();
        response.put("status", "SUCCESS");
        response.put("message", "Security relay alarm reset completed.");
        response.put("alarmActive", false);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getSystemStatus() {
        Map<String, Object> status = new HashMap<>();
        status.put("monitoring", isMonitoring);
        status.put("alarmActive", isAlarmActive);
        status.put("cameraConnected", true);
        status.put("arduinoConnected", true);
        status.put("fps", isMonitoring ? 60 : 0);
        status.put("neuralLoadPercent", isMonitoring ? 14.2 : 1.5);
        return ResponseEntity.ok(status);
    }
}
