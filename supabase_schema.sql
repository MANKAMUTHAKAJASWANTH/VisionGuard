-- =====================================================
-- VisionGuard Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- =====================================================

-- 1. Registered Users Table
CREATE TABLE IF NOT EXISTS "public"."registered_users" (
    "id"                   TEXT PRIMARY KEY,
    "name"                 TEXT NOT NULL,
    "role"                 TEXT,
    "photoUrl"             TEXT,
    "regDate"              TEXT,
    "faceEmbedding"        TEXT,
    "totalCapturedImages"  INTEGER DEFAULT 0
);

-- 2. Detection Logs Table
CREATE TABLE IF NOT EXISTS "public"."detection_logs" (
    "id"             TEXT PRIMARY KEY,
    "name"           TEXT,
    "status"         TEXT,
    "date"           TEXT,
    "time"           TEXT,
    "confidence"     INTEGER,
    "photoUrl"       TEXT,
    "user_id"        TEXT,
    "designation"    TEXT,
    "camera_id"      TEXT DEFAULT 'CAM-01',
    "log_timestamp"  TIMESTAMP DEFAULT timezone('Asia/Kolkata', NOW()),
    "auth_method"    TEXT DEFAULT 'FACE'
);

-- Ensure columns exist if table was already created
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "designation" TEXT;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "camera_id" TEXT DEFAULT 'CAM-01';
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "log_timestamp" TIMESTAMP DEFAULT timezone('Asia/Kolkata', NOW());
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "auth_method" TEXT DEFAULT 'FACE';

-- 3. System Settings Table (single row - id = 'default')
CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id"                    TEXT PRIMARY KEY DEFAULT 'default',
    "cameraSource"          TEXT,
    "comPort"               TEXT,
    "alarmSound"            BOOLEAN DEFAULT TRUE,
    "confidenceThreshold"   INTEGER DEFAULT 85,
    "arduinoConnected"      BOOLEAN DEFAULT FALSE,
    "themeMode"             TEXT DEFAULT 'dark'
);

-- Seed the default settings row (safe to run multiple times)
INSERT INTO "public"."system_settings"
    ("id", "cameraSource", "comPort", "alarmSound", "confidenceThreshold", "arduinoConnected", "themeMode")
VALUES
    ('default', 'Front Entrance Camera [USB-0]', 'COM4', TRUE, 85, FALSE, 'dark')
ON CONFLICT ("id") DO NOTHING;

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================
ALTER TABLE "public"."registered_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."detection_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'registered_users' AND policyname = 'anon_read_users') THEN
        CREATE POLICY "anon_read_users" ON "public"."registered_users" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'registered_users' AND policyname = 'anon_write_users') THEN
        CREATE POLICY "anon_write_users" ON "public"."registered_users" FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'detection_logs' AND policyname = 'anon_read_logs') THEN
        CREATE POLICY "anon_read_logs" ON "public"."detection_logs" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'detection_logs' AND policyname = 'anon_write_logs') THEN
        CREATE POLICY "anon_write_logs" ON "public"."detection_logs" FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'anon_read_settings') THEN
        CREATE POLICY "anon_read_settings" ON "public"."system_settings" FOR SELECT USING (true);
    END IF;
END $$;

-- 4. Optimization Indexes
CREATE INDEX IF NOT EXISTS "idx_detection_logs_status" ON "public"."detection_logs"("status");
CREATE INDEX IF NOT EXISTS "idx_detection_logs_date_time" ON "public"."detection_logs" ("date", "time" DESC);

-- =====================================================
-- 5. Production-Ready Upgrades & Migrations
-- =====================================================

-- --- A. Alter Tables: Add Columns ---
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "registration_timestamp" TIMESTAMP DEFAULT timezone('Asia/Kolkata', NOW());
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP DEFAULT timezone('Asia/Kolkata', NOW());
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP DEFAULT timezone('Asia/Kolkata', NOW());
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "is_enrolled" BOOLEAN DEFAULT TRUE;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "enrollment_type" TEXT DEFAULT 'Biometric';
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "last_recognized_at" TIMESTAMP;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "updated_by" TEXT DEFAULT 'system';

ALTER TABLE "public"."registered_users" ALTER COLUMN "registration_timestamp" TYPE TIMESTAMP USING "registration_timestamp" AT TIME ZONE 'UTC';
ALTER TABLE "public"."registered_users" ALTER COLUMN "registration_timestamp" SET DEFAULT timezone('Asia/Kolkata', NOW());
ALTER TABLE "public"."registered_users" ALTER COLUMN "created_at" TYPE TIMESTAMP USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."registered_users" ALTER COLUMN "created_at" SET DEFAULT timezone('Asia/Kolkata', NOW());
ALTER TABLE "public"."registered_users" ALTER COLUMN "updated_at" TYPE TIMESTAMP USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."registered_users" ALTER COLUMN "updated_at" SET DEFAULT timezone('Asia/Kolkata', NOW());

ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "log_timestamp" TIMESTAMP DEFAULT timezone('Asia/Kolkata', NOW());
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP DEFAULT timezone('Asia/Kolkata', NOW());
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "severity" TEXT DEFAULT 'info';
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "is_resolved" BOOLEAN DEFAULT FALSE;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMP;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "resolved_by" TEXT;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "raw_log_data" JSONB;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

ALTER TABLE "public"."detection_logs" ALTER COLUMN "log_timestamp" TYPE TIMESTAMP USING "log_timestamp" AT TIME ZONE 'UTC';
ALTER TABLE "public"."detection_logs" ALTER COLUMN "log_timestamp" SET DEFAULT timezone('Asia/Kolkata', NOW());
ALTER TABLE "public"."detection_logs" ALTER COLUMN "created_at" TYPE TIMESTAMP USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."detection_logs" ALTER COLUMN "created_at" SET DEFAULT timezone('Asia/Kolkata', NOW());

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_detection_logs_user_id') THEN
        ALTER TABLE "public"."detection_logs" 
        ADD CONSTRAINT "fk_detection_logs_user_id" 
        FOREIGN KEY ("user_id") REFERENCES "public"."registered_users"("id") ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "camera_status" TEXT DEFAULT 'OFFLINE';
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "camera_resolution" TEXT DEFAULT '1280x720';
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "camera_fps" INTEGER DEFAULT 0;
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "arduino_status" TEXT DEFAULT 'Disconnected';
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "arduino_port" TEXT;
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "arduino_baudrate" INTEGER DEFAULT 9600;
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "ai_model_status" TEXT DEFAULT 'Loaded';
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "ai_model_name" TEXT DEFAULT 'TinyFaceDetector';
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "ai_model_version" TEXT DEFAULT 'v1';
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP DEFAULT timezone('Asia/Kolkata', NOW());
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP DEFAULT timezone('Asia/Kolkata', NOW());

ALTER TABLE "public"."system_settings" ALTER COLUMN "created_at" TYPE TIMESTAMP USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."system_settings" ALTER COLUMN "created_at" SET DEFAULT timezone('Asia/Kolkata', NOW());
ALTER TABLE "public"."system_settings" ALTER COLUMN "updated_at" TYPE TIMESTAMP USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."system_settings" ALTER COLUMN "updated_at" SET DEFAULT timezone('Asia/Kolkata', NOW());

-- --- B. Performance Indexes ---
CREATE INDEX IF NOT EXISTS "idx_registered_users_name" ON "public"."registered_users"("name");
CREATE INDEX IF NOT EXISTS "idx_registered_users_role" ON "public"."registered_users"("role");
CREATE INDEX IF NOT EXISTS "idx_registered_users_enrolled" ON "public"."registered_users" ("is_enrolled");
CREATE INDEX IF NOT EXISTS "idx_detection_logs_log_timestamp" ON "public"."detection_logs"("log_timestamp" DESC);
CREATE INDEX IF NOT EXISTS "idx_detection_logs_user_id" ON "public"."detection_logs"("user_id");
CREATE INDEX IF NOT EXISTS "idx_detection_logs_severity" ON "public"."detection_logs"("severity");
CREATE INDEX IF NOT EXISTS "idx_detection_logs_is_resolved" ON "public"."detection_logs"("is_resolved");
CREATE INDEX IF NOT EXISTS "idx_detection_logs_status_timestamp" ON "public"."detection_logs" ("status", "log_timestamp" DESC);

-- --- C. Functions and Triggers for Automation & Backward Compatibility ---
CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = timezone('Asia/Kolkata', NOW());
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "update_registered_users_updated_at" ON "public"."registered_users";
CREATE TRIGGER "update_registered_users_updated_at"
BEFORE UPDATE ON "public"."registered_users"
FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DROP TRIGGER IF EXISTS "update_system_settings_updated_at" ON "public"."system_settings";
CREATE TRIGGER "update_system_settings_updated_at"
BEFORE UPDATE ON "public"."system_settings"
FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE FUNCTION "public"."sync_user_timestamps"()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('Asia/Kolkata', NOW());
    IF NEW."registration_timestamp" IS NULL THEN
        NEW."registration_timestamp" = timezone('Asia/Kolkata', NOW());
    END IF;
    IF NEW."regDate" IS NULL OR NEW."regDate" = '' THEN
        NEW."regDate" = to_char(NEW."registration_timestamp", 'Mon DD, YYYY');
    END IF;
    IF NEW."registrationDate" IS NULL OR NEW."registrationDate" = '' THEN
        NEW."registrationDate" = to_char(NEW."registration_timestamp", 'Mon DD, YYYY');
    END IF;
    IF NEW."registrationTime" IS NULL OR NEW."registrationTime" = '' THEN
        NEW."registrationTime" = to_char(NEW."registration_timestamp", 'HH24:MI:SS');
    END IF;
    NEW."lastUpdatedDate" = to_char(NEW.updated_at, 'Mon DD, YYYY');
    NEW."lastUpdatedTime" = to_char(NEW.updated_at, 'HH24:MI:SS');
    IF NEW."profile_photo" IS NULL OR NEW."profile_photo" = '' THEN
        NEW."profile_photo" = NEW."photoUrl";
    END IF;
    IF NEW."photoUrl" IS NULL OR NEW."photoUrl" = '' THEN
        NEW."photoUrl" = NEW."profile_photo";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trigger_sync_user_timestamps" ON "public"."registered_users";
CREATE TRIGGER "trigger_sync_user_timestamps"
BEFORE INSERT OR UPDATE ON "public"."registered_users"
FOR EACH ROW EXECUTE FUNCTION "public"."sync_user_timestamps"();

CREATE OR REPLACE FUNCTION "public"."sync_detection_log_timestamps"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."log_timestamp" IS NULL THEN
        NEW."log_timestamp" = timezone('Asia/Kolkata', NOW());
    END IF;
    IF NEW."detected_at" IS NULL THEN
        NEW."detected_at" = NEW."log_timestamp";
    END IF;
    IF NEW."date" IS NULL OR NEW."date" = '' THEN
        NEW."date" = to_char(NEW."log_timestamp", 'Mon DD, YYYY');
    END IF;
    IF NEW."detectionDate" IS NULL OR NEW."detectionDate" = '' THEN
        NEW."detectionDate" = to_char(NEW."log_timestamp", 'Mon DD, YYYY');
    END IF;
    IF NEW."time" IS NULL OR NEW."time" = '' THEN
        NEW."time" = to_char(NEW."log_timestamp", 'HH24:MI:SS');
    END IF;
    IF NEW."detectionTime" IS NULL OR NEW."detectionTime" = '' THEN
        NEW."detectionTime" = to_char(NEW."log_timestamp", 'HH24:MI:SS');
    END IF;
    IF NEW."userId" IS NULL OR NEW."userId" = '' THEN
        NEW."userId" = NEW."user_id";
    END IF;
    IF NEW."user_id" IS NULL OR NEW."user_id" = '' THEN
        NEW."user_id" = NEW."userId";
    END IF;
    IF NEW."detectedName" IS NULL OR NEW."detectedName" = '' THEN
        NEW."detectedName" = NEW."name";
    END IF;
    IF NEW."name" IS NULL OR NEW."name" = '' THEN
        NEW."name" = NEW."detectedName";
    END IF;
    IF NEW."snapshotUrl" IS NULL OR NEW."snapshotUrl" = '' THEN
        NEW."snapshotUrl" = NEW."photoUrl";
    END IF;
    IF NEW."photoUrl" IS NULL OR NEW."photoUrl" = '' THEN
        NEW."photoUrl" = NEW."snapshotUrl";
    END IF;
    IF NEW."image_url" IS NULL OR NEW."image_url" = '' THEN
        NEW."image_url" = NEW."photoUrl";
    END IF;
    IF NEW."image_path" IS NULL OR NEW."image_path" = '' THEN
        NEW."image_path" = NEW."photoUrl";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trigger_sync_detection_log_timestamps" ON "public"."detection_logs";
CREATE TRIGGER "trigger_sync_detection_log_timestamps"
BEFORE INSERT ON "public"."detection_logs"
FOR EACH ROW EXECUTE FUNCTION "public"."sync_detection_log_timestamps"();

-- --- D. Schema Upgrades for Production-Ready VisionGuard ---
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "profile_photo" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "mobile_number" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'Active';
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "registrationDate" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "registrationTime" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "lastUpdatedDate" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "lastUpdatedTime" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "face_images" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "created_by_admin_name" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "created_by_admin_id" TEXT;

ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "detectedName" TEXT;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "snapshotUrl" TEXT;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "cameraName" TEXT DEFAULT 'Default Camera';
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "detectionDate" TEXT;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "detectionTime" TEXT;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "detected_at" TIMESTAMP DEFAULT timezone('Asia/Kolkata', NOW());

ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "cameraStatus" TEXT DEFAULT 'OFFLINE';
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "monitoringStatus" TEXT DEFAULT 'STANDBY';
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "aiModelStatus" TEXT DEFAULT 'Loaded';
ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "databaseStatus" TEXT DEFAULT 'CONNECTED';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_detection_logs_userId') THEN
        ALTER TABLE "public"."detection_logs" 
        ADD CONSTRAINT "fk_detection_logs_userId" 
        FOREIGN KEY ("userId") REFERENCES "public"."registered_users"("id") ON DELETE SET NULL;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION "public"."sync_system_settings_fields"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."cameraStatus" IS NULL OR NEW."cameraStatus" = '' THEN
        NEW."cameraStatus" = NEW."camera_status";
    END IF;
    IF NEW."camera_status" IS NULL OR NEW."camera_status" = '' THEN
        NEW."camera_status" = NEW."cameraStatus";
    END IF;
    IF NEW."aiModelStatus" IS NULL OR NEW."aiModelStatus" = '' THEN
        NEW."aiModelStatus" = NEW."ai_model_status";
    END IF;
    IF NEW."ai_model_status" IS NULL OR NEW."ai_model_status" = '' THEN
        NEW."ai_model_status" = NEW."aiModelStatus";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trigger_sync_system_settings_fields" ON "public"."system_settings";
CREATE TRIGGER "trigger_sync_system_settings_fields"
BEFORE INSERT OR UPDATE ON "public"."system_settings"
FOR EACH ROW EXECUTE FUNCTION "public"."sync_system_settings_fields"();

-- =====================================================
-- 6. Face Images Table (Multiple Embeddings per User)
-- =====================================================
CREATE TABLE IF NOT EXISTS "public"."face_images" (
    "id"            TEXT PRIMARY KEY,
    "user_id"       TEXT NOT NULL,
    "image_url"     TEXT NOT NULL,
    "embedding"     TEXT NOT NULL,
    "capture_angle" TEXT,
    "created_at"    TIMESTAMP DEFAULT timezone('Asia/Kolkata', NOW())
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_face_images_user_id') THEN
        ALTER TABLE "public"."face_images" 
        ADD CONSTRAINT "fk_face_images_user_id" 
        FOREIGN KEY ("user_id") REFERENCES "public"."registered_users"("id") ON DELETE CASCADE;
    END IF;
END $$;

ALTER TABLE "public"."face_images" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'face_images' AND policyname = 'anon_read_face_images') THEN
        CREATE POLICY "anon_read_face_images" ON "public"."face_images" FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'face_images' AND policyname = 'anon_write_face_images') THEN
        CREATE POLICY "anon_write_face_images" ON "public"."face_images" FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_face_images_user_id" ON "public"."face_images"("user_id");

-- =====================================================
-- 7. Supabase Storage Bucket & Policies Setup
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('face-images', 'face-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Allow Public Select') THEN
        CREATE POLICY "Allow Public Select" ON storage.objects FOR SELECT USING (bucket_id = 'face-images');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Allow Public Insert') THEN
        CREATE POLICY "Allow Public Insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'face-images');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Allow Public Delete') THEN
        CREATE POLICY "Allow Public Delete" ON storage.objects FOR DELETE USING (bucket_id = 'face-images');
    END IF;
END $$;

ALTER TABLE "public"."system_settings" ADD COLUMN IF NOT EXISTS "security_mode" BOOLEAN DEFAULT FALSE;

-- =====================================================
-- 8. Enterprise restricted area specifications upgrades
-- =====================================================
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "age" INTEGER;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "designation" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "registration_date" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "registration_time" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "last_updated_date" TEXT;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "last_updated_time" TEXT;

CREATE OR REPLACE FUNCTION "public"."sync_user_timestamps"()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('Asia/Kolkata', NOW());
    IF NEW."registration_timestamp" IS NULL THEN
        NEW."registration_timestamp" = timezone('Asia/Kolkata', NOW());
    END IF;
    IF NEW."regDate" IS NULL OR NEW."regDate" = '' THEN
        NEW."regDate" = to_char(NEW."registration_timestamp", 'Mon DD, YYYY');
    END IF;
    IF NEW."registrationDate" IS NULL OR NEW."registrationDate" = '' THEN
        NEW."registrationDate" = to_char(NEW."registration_timestamp", 'Mon DD, YYYY');
    END IF;
    IF NEW."registration_date" IS NULL OR NEW."registration_date" = '' THEN
        NEW."registration_date" = to_char(NEW."registration_timestamp", 'Mon DD, YYYY');
    END IF;
    IF NEW."registrationTime" IS NULL OR NEW."registrationTime" = '' THEN
        NEW."registrationTime" = to_char(NEW."registration_timestamp", 'HH24:MI:SS');
    END IF;
    IF NEW."registration_time" IS NULL OR NEW."registration_time" = '' THEN
        NEW."registration_time" = to_char(NEW."registration_timestamp", 'HH24:MI:SS');
    END IF;
    NEW."lastUpdatedDate" = to_char(NEW.updated_at, 'Mon DD, YYYY');
    NEW."lastUpdatedTime" = to_char(NEW.updated_at, 'HH24:MI:SS');
    NEW."last_updated_date" = to_char(NEW.updated_at, 'Mon DD, YYYY');
    NEW."last_updated_time" = to_char(NEW.updated_at, 'HH24:MI:SS');
    IF NEW."profile_photo" IS NULL OR NEW."profile_photo" = '' THEN
        NEW."profile_photo" = NEW."photoUrl";
    END IF;
    IF NEW."photoUrl" IS NULL OR NEW."photoUrl" = '' THEN
        NEW."photoUrl" = NEW."profile_photo";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. Anti-Spoof Schema Migration
-- =====================================================
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "spoof_detected_bool" BOOLEAN DEFAULT FALSE;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "multiple_faces_bool" BOOLEAN DEFAULT FALSE;

-- FIX: Wrapped in EXECUTE blocks to prevent query compilation failure when columns do not exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'detection_logs' 
          AND column_name = 'spoof_detected' 
          AND data_type = 'text'
    ) THEN
        EXECUTE 'UPDATE "public"."detection_logs"
          SET "spoof_detected_bool" = CASE WHEN "spoof_detected" = ''Yes'' THEN TRUE ELSE FALSE END
          WHERE "spoof_detected_bool" IS NULL OR "spoof_detected_bool" = FALSE;';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'detection_logs' 
          AND column_name = 'multiple_persons' 
          AND data_type = 'text'
    ) THEN
        EXECUTE 'UPDATE "public"."detection_logs"
          SET "multiple_faces_bool" = CASE WHEN "multiple_persons" = ''Yes'' THEN TRUE ELSE FALSE END
          WHERE "multiple_faces_bool" IS NULL OR "multiple_faces_bool" = FALSE;';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='detection_logs' AND column_name='spoof_detected' AND data_type='text') THEN
        ALTER TABLE "public"."detection_logs" DROP COLUMN IF EXISTS "spoof_detected";
        ALTER TABLE "public"."detection_logs" RENAME COLUMN "spoof_detected_bool" TO "spoof_detected";
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='detection_logs' AND column_name='spoof_detected') THEN
            ALTER TABLE "public"."detection_logs" RENAME COLUMN "spoof_detected_bool" TO "spoof_detected";
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='detection_logs' AND column_name='multiple_persons' AND data_type='text') THEN
        ALTER TABLE "public"."detection_logs" DROP COLUMN IF EXISTS "multiple_persons";
        ALTER TABLE "public"."detection_logs" RENAME COLUMN "multiple_faces_bool" TO "multiple_faces";
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='detection_logs' AND column_name='multiple_faces') THEN
            ALTER TABLE "public"."detection_logs" RENAME COLUMN "multiple_faces_bool" TO "multiple_faces";
        END IF;
    END IF;
END $$;

ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "spoof_reason" TEXT;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "liveness_score" FLOAT;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "face_count" INTEGER DEFAULT 1;

UPDATE "public"."detection_logs" SET "face_count" = 1 WHERE "face_count" IS NULL;
UPDATE "public"."detection_logs" SET "spoof_detected" = FALSE WHERE "spoof_detected" IS NULL;
UPDATE "public"."detection_logs" SET "multiple_faces" = FALSE WHERE "multiple_faces" IS NULL;

ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "registration_status" TEXT DEFAULT 'Active';
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "face_samples" INTEGER DEFAULT 0;
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "embedding_version" TEXT DEFAULT 'v1';
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "last_updated" TIMESTAMP DEFAULT timezone('Asia/Kolkata', NOW());
ALTER TABLE "public"."registered_users" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN DEFAULT TRUE;

UPDATE "public"."registered_users" SET "is_active" = TRUE WHERE "is_active" IS NULL;
UPDATE "public"."registered_users" SET "registration_status" = 'Active' WHERE "registration_status" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_detection_logs_spoof_detected" ON "public"."detection_logs"("spoof_detected");
CREATE INDEX IF NOT EXISTS "idx_detection_logs_multiple_faces" ON "public"."detection_logs"("multiple_faces");
CREATE INDEX IF NOT EXISTS "idx_detection_logs_timestamp" ON "public"."detection_logs"("log_timestamp" DESC);
CREATE INDEX IF NOT EXISTS "idx_detection_logs_employee_id" ON "public"."detection_logs"("user_id");
CREATE INDEX IF NOT EXISTS "idx_detection_logs_status_spoof" ON "public"."detection_logs"("status", "spoof_detected");

CREATE INDEX IF NOT EXISTS "idx_registered_users_is_active" ON "public"."registered_users"("is_active");
CREATE INDEX IF NOT EXISTS "idx_registered_users_registration_status" ON "public"."registered_users"("registration_status");

-- =====================================================
-- 10. CRITICAL Bug-Fix Migration
-- =====================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'detection_logs'
          AND column_name  = 'log_timestamp'
          AND data_type    = 'timestamp without time zone'
    ) THEN
        ALTER TABLE "public"."detection_logs"
            ALTER COLUMN "log_timestamp" TYPE TIMESTAMPTZ
            USING "log_timestamp" AT TIME ZONE 'Asia/Kolkata';
    END IF;
END $$;

ALTER TABLE "public"."detection_logs" ALTER COLUMN "log_timestamp" SET DEFAULT NOW();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'registered_users'
          AND column_name  = 'created_at'
          AND data_type    = 'timestamp without time zone'
    ) THEN
        ALTER TABLE "public"."registered_users"
            ALTER COLUMN "created_at" TYPE TIMESTAMPTZ
            USING "created_at" AT TIME ZONE 'Asia/Kolkata';
    END IF;
END $$;

ALTER TABLE "public"."registered_users" ALTER COLUMN "created_at" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'detection_logs' AND policyname = 'anon_delete_logs') THEN
        CREATE POLICY "anon_delete_logs" ON "public"."detection_logs" FOR DELETE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'registered_users' AND policyname = 'anon_delete_users') THEN
        CREATE POLICY "anon_delete_users" ON "public"."registered_users" FOR DELETE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'face_images' AND policyname = 'anon_all_face_images') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'face_images') THEN
            CREATE POLICY "anon_all_face_images" ON "public"."face_images" FOR ALL USING (true) WITH CHECK (true);
        END IF;
    END IF;
END $$;

DROP INDEX IF EXISTS "idx_detection_logs_timestamp";
CREATE INDEX "idx_detection_logs_timestamp" ON "public"."detection_logs"("log_timestamp" DESC NULLS LAST);

-- =====================================================
-- 11. CRITICAL: Remove Device Detection Columns
-- =====================================================
ALTER TABLE "public"."detection_logs" DROP COLUMN IF EXISTS "device_detected";
ALTER TABLE "public"."detection_logs" DROP COLUMN IF EXISTS "device_type";

-- =====================================================
-- 12. Unauthorized Detection Snapshot Image Storage
-- =====================================================
-- image_url: Public Supabase Storage URL of the captured snapshot
-- image_path: Storage path inside the bucket (for deletion/reference)
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
ALTER TABLE "public"."detection_logs" ADD COLUMN IF NOT EXISTS "image_path" TEXT;

-- Index for quick lookup of logs that have images
CREATE INDEX IF NOT EXISTS "idx_detection_logs_image_url" ON "public"."detection_logs"("image_url") WHERE "image_url" IS NOT NULL;

-- =====================================================
-- 13. Supabase Storage: face-images bucket policies
-- =====================================================
-- Run this ONCE to ensure the face-images bucket exists and is public:
-- (If bucket doesn't exist yet, create it in Storage → New Bucket → name: face-images → Public)
-- Then ensure these RLS policies exist on the storage.objects table:

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'visionguard_storage_anon_select'
    ) THEN
        CREATE POLICY "visionguard_storage_anon_select"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'face-images');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'visionguard_storage_anon_insert'
    ) THEN
        CREATE POLICY "visionguard_storage_anon_insert"
        ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'face-images');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'visionguard_storage_anon_update'
    ) THEN
        CREATE POLICY "visionguard_storage_anon_update"
        ON storage.objects FOR UPDATE
        USING (bucket_id = 'face-images');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'visionguard_storage_anon_delete'
    ) THEN
        CREATE POLICY "visionguard_storage_anon_delete"
        ON storage.objects FOR DELETE
        USING (bucket_id = 'face-images');
    END IF;
END $$;


