package com.visionguard.api.controller;

import com.visionguard.api.model.DetectionLog;
import com.visionguard.api.service.SupabaseService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/logs")
@CrossOrigin(origins = "*")
public class LogController {

    @Autowired
    private SupabaseService supabaseService;

    @GetMapping
    public ResponseEntity<?> getLogs(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search) {
        try {
            List<DetectionLog> logs = supabaseService.getLogs();

            if (status != null && !status.equalsIgnoreCase("All")) {
                logs = logs.stream()
                        .filter(l -> l.getStatus() != null && l.getStatus().equalsIgnoreCase(status))
                        .collect(Collectors.toList());
            }

            if (search != null && !search.isEmpty()) {
                String q = search.toLowerCase();
                logs = logs.stream()
                        .filter(l -> (l.getName() != null && l.getName().toLowerCase().contains(q)) || (l.getId() != null && l.getId().toLowerCase().contains(q)))
                        .collect(Collectors.toList());
            }

            logs.sort((a, b) -> {
                if (a.getId() == null && b.getId() == null) return 0;
                if (a.getId() == null) return 1;
                if (b.getId() == null) return -1;
                return b.getId().compareTo(a.getId());
            });
            return ResponseEntity.ok(logs);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(500).body("{\"error\": \"" + e.getMessage() + "\"}");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("{\"error\": \"Failed to fetch logs: " + e.getMessage() + "\"}");
        }
    }

    @PostMapping
    public ResponseEntity<?> addLogEntry(@RequestBody DetectionLog log) {
        try {
            if (log.getId() == null || log.getId().isEmpty()) {
                log.setId("LOG-" + System.currentTimeMillis());
            }
            DetectionLog saved = supabaseService.saveLog(log);
            return ResponseEntity.ok(saved);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(500).body("{\"error\": \"" + e.getMessage() + "\"}");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("{\"error\": \"Failed to add log: " + e.getMessage() + "\"}");
        }
    }

    @DeleteMapping
    public ResponseEntity<?> clearLogs() {
        try {
            supabaseService.clearLogs();
            return ResponseEntity.ok().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.status(500).body("{\"error\": \"" + e.getMessage() + "\"}");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("{\"error\": \"Failed to clear logs: " + e.getMessage() + "\"}");
        }
    }
}
