package com.visionguard.api.repository;

import com.visionguard.api.model.DetectionLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface DetectionLogRepository extends JpaRepository<DetectionLog, String> {
}
