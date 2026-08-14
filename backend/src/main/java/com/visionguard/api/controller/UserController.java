package com.visionguard.api.controller;

import com.visionguard.api.model.User;
import com.visionguard.api.service.SupabaseService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = "*")
public class UserController {

    @Autowired
    private SupabaseService supabaseService;

    @GetMapping
    public ResponseEntity<?> getAllUsers() {
        try {
            List<User> users = supabaseService.getUsers();
            return ResponseEntity.ok(users);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(500).body("{\"error\": \"" + e.getMessage() + "\"}");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("{\"error\": \"Failed to fetch users: " + e.getMessage() + "\"}");
        }
    }

    @PostMapping
    public ResponseEntity<?> registerUser(@RequestBody User user) {
        try {
            if (user.getId() == null || user.getId().isEmpty()) {
                user.setId("VG-" + (1000 + (int)(Math.random() * 9000)));
            }
            User saved = supabaseService.saveUser(user);
            return ResponseEntity.ok(saved);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(500).body("{\"error\": \"" + e.getMessage() + "\"}");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("{\"error\": \"Failed to register user: " + e.getMessage() + "\"}");
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateUser(@PathVariable String id, @RequestBody User user) {
        try {
            if (!supabaseService.existsUserById(id)) {
                return ResponseEntity.notFound().build();
            }
            user.setId(id);
            User updated = supabaseService.saveUser(user);
            return ResponseEntity.ok(updated);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(500).body("{\"error\": \"" + e.getMessage() + "\"}");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("{\"error\": \"Failed to update user: " + e.getMessage() + "\"}");
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> revokeUser(@PathVariable String id) {
        try {
            if (!supabaseService.existsUserById(id)) {
                return ResponseEntity.notFound().build();
            }
            supabaseService.deleteUserById(id);
            return ResponseEntity.ok().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.status(500).body("{\"error\": \"" + e.getMessage() + "\"}");
        } catch (Exception e) {
            return ResponseEntity.status(500).body("{\"error\": \"Failed to revoke user: " + e.getMessage() + "\"}");
        }
    }
}
