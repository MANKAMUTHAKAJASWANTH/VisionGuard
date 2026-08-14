package com.visionguard.api.repository;

import com.visionguard.api.model.SystemSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SettingsRepository extends JpaRepository<SystemSettings, String> {
}
