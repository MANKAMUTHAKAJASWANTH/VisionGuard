package com.visionguard.api.controller;

import com.visionguard.api.model.SystemSettings;
import com.visionguard.api.service.SupabaseService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/settings")
@CrossOrigin(origins = "*")
public class SettingsController {

    @Autowired
    private SupabaseService supabaseService;

    private static final SystemSettings DEFAULT_SETTINGS = new SystemSettings(
            "default",
            "Front Entrance Camera [USB-0]",
            "COM4",
            true,
            85,
            false,
            "dark"
    );

    @GetMapping
    public ResponseEntity<?> getSettings() {
        try {
            SystemSettings settings = supabaseService.getSettings().orElseGet(() -> {
                // Seed default settings into Supabase if none exist
                try {
                    return supabaseService.saveSettings(DEFAULT_SETTINGS);
                } catch (Exception ex) {
                    return DEFAULT_SETTINGS;
                }
            });
            return ResponseEntity.ok(settings);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(500).body("{\"error\": \"" + e.getMessage() + "\"}");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("{\"error\": \"Failed to fetch settings: " + e.getMessage() + "\"}");
        }
    }

    @PostMapping
    @PutMapping
    public ResponseEntity<?> updateSettings(@RequestBody SystemSettings settings) {
        try {
            settings.setId("default");
            SystemSettings saved = supabaseService.saveSettings(settings);
            return ResponseEntity.ok(saved);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(500).body("{\"error\": \"" + e.getMessage() + "\"}");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("{\"error\": \"Failed to update settings: " + e.getMessage() + "\"}");
        }
    }
}
