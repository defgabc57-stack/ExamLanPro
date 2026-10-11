-- ExamLAN Pro | RANCANGAN skema Next.js JavaScript + MySQL 8.0/InnoDB
-- Perlu direview/dijalankan dahulu di database staging, bukan data produksi.
-- Semua data contoh fiktif / tidak menyertakan hash dan data pribadi dari sumber.
-- Strategi: immutable question snapshot per attempt untuk mempertahankan hasil saat soal diedit.
CREATE DATABASE IF NOT EXISTS examlan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE examlan;

CREATE TABLE IF NOT EXISTS teachers (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 username VARCHAR(80) NOT NULL,
 password_hash VARCHAR(255) NOT NULL,
 password_changed_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_teacher_username (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teacher_sessions (
 id CHAR(36) PRIMARY KEY,
 teacher_id BIGINT UNSIGNED NOT NULL,
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 last_activity_at DATETIME(3) NOT NULL,
 expires_at DATETIME(3) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_teacher_session_token (token_hash),
 KEY idx_teacher_sessions_expiry (teacher_id, expires_at),
 CONSTRAINT fk_ts_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS media_assets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 file_path VARCHAR(500) NOT NULL,
 mime_type VARCHAR(100) NOT NULL,
 size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
 sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 uploaded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_media_path (file_path)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 legacy_id VARCHAR(100) NULL,
 nis VARCHAR(30) NULL,
 name VARCHAR(255) NOT NULL,
 class_name VARCHAR(80) NOT NULL,
 homeroom VARCHAR(255) NULL,
 photo_asset_id BIGINT UNSIGNED NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_students_nis (nis),
 UNIQUE KEY uq_student_legacy_id (legacy_id),
 CONSTRAINT fk_students_photo FOREIGN KEY (photo_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quizzes (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 legacy_id VARCHAR(100) NULL,
 title VARCHAR(255) NOT NULL,
 description TEXT NULL,
 subject VARCHAR(150) NULL,
 class_name VARCHAR(80) NULL,
 quiz_type ENUM('mixed','mc','complex','cause_effect','case_analysis','scaled') NULL,
 duration_minutes INT UNSIGNED NOT NULL,
 status ENUM('DRAFT','SIAP','ACTIVE','SELESAI','DIARSIPKAN') NOT NULL DEFAULT 'DRAFT',
 start_at DATETIME(3) NULL,
 end_at DATETIME(3) NULL,
 pin_hash VARCHAR(255) NULL,
 pin_enabled TINYINT(1) NOT NULL DEFAULT 0,
 review_enabled TINYINT(1) NOT NULL DEFAULT 0,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_quiz_legacy_id (legacy_id),
 KEY idx_quiz_status_dates (status, start_at, end_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS questions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 quiz_id BIGINT UNSIGNED NOT NULL,
 legacy_index INT UNSIGNED NULL,
 type ENUM('mc','complex','cause_effect','case_analysis','scaled') NOT NULL,
 question_text LONGTEXT NULL,
 statement LONGTEXT NULL,
 reason LONGTEXT NULL,
 passage LONGTEXT NULL,
 explanation LONGTEXT NULL,
 image_asset_id BIGINT UNSIGNED NULL,
 display_order INT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_question_order (quiz_id, display_order),
 CONSTRAINT fk_question_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
 CONSTRAINT fk_question_image FOREIGN KEY (image_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS question_options (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 question_id BIGINT UNSIGNED NOT NULL,
 display_order INT UNSIGNED NOT NULL,
 text_value LONGTEXT NOT NULL,
 score_value DECIMAL(10,3) NULL,
 is_correct TINYINT(1) NOT NULL DEFAULT 0,
 UNIQUE KEY uq_option_order (question_id, display_order),
 CONSTRAINT fk_option_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attempts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 quiz_id BIGINT UNSIGNED NOT NULL,
 student_id BIGINT UNSIGNED NULL,
 nis_snapshot VARCHAR(30) NOT NULL,
 name_snapshot VARCHAR(255) NOT NULL,
 class_snapshot VARCHAR(80) NOT NULL,
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 started_at DATETIME(3) NOT NULL,
 ends_at DATETIME(3) NOT NULL,
 updated_at DATETIME(3) NOT NULL,
 status ENUM('ACTIVE','SUBMITTED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
 submitted_at DATETIME(3) NULL,
 UNIQUE KEY uq_attempt_token (token_hash),
 KEY idx_attempt_by_quiz_nis (quiz_id, nis_snapshot, status),
 KEY idx_attempt_status_timeout (status, ends_at),
 CONSTRAINT fk_attempt_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE RESTRICT,
 CONSTRAINT fk_attempt_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attempt_questions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 attempt_id BIGINT UNSIGNED NOT NULL,
 question_id BIGINT UNSIGNED NULL,
 position INT UNSIGNED NOT NULL,
 snapshot_json JSON NOT NULL,
 option_order_json JSON NOT NULL,
 UNIQUE KEY uq_attempt_question_pos (attempt_id, position),
 CONSTRAINT fk_aq_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
 CONSTRAINT fk_aq_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attempt_answers (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 attempt_id BIGINT UNSIGNED NOT NULL,
 question_position INT UNSIGNED NOT NULL,
 answer_json JSON NOT NULL,
 client_revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
 saved_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_attempt_answer_position (attempt_id, question_position),
 CONSTRAINT fk_aa_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exam_results (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 attempt_id BIGINT UNSIGNED NOT NULL,
 quiz_id BIGINT UNSIGNED NOT NULL,
 nis_snapshot VARCHAR(30) NOT NULL,
 name_snapshot VARCHAR(255) NOT NULL,
 class_snapshot VARCHAR(80) NOT NULL,
 score INT UNSIGNED NOT NULL,
 correct_count INT UNSIGNED NOT NULL,
 wrong_count INT UNSIGNED NOT NULL,
 legacy_date_text VARCHAR(40) NULL,
 submitted_at DATETIME(3) NOT NULL,
 review_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 UNIQUE KEY uq_result_attempt (attempt_id),
 UNIQUE KEY uq_result_review_token (review_token_hash),
 KEY idx_results_quiz_nis_date (quiz_id, nis_snapshot, submitted_at),
 CONSTRAINT fk_result_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE RESTRICT,
 CONSTRAINT fk_result_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS result_breakdowns (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 result_id BIGINT UNSIGNED NOT NULL,
 position INT UNSIGNED NOT NULL,
 question_snapshot_json JSON NOT NULL,
 given_answer_json JSON NULL,
 is_correct TINYINT(1) NOT NULL DEFAULT 0,
 student_answer_text LONGTEXT NULL,
 correct_answer_text LONGTEXT NULL,
 UNIQUE KEY uq_breakdown_pos (result_id, position),
 CONSTRAINT fk_rb_result FOREIGN KEY (result_id) REFERENCES exam_results(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS retake_permissions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 quiz_id BIGINT UNSIGNED NOT NULL,
 nis VARCHAR(30) NOT NULL,
 remaining TINYINT UNSIGNED NOT NULL,
 reason TEXT NULL,
 expires_at DATETIME(3) NULL,
 granted_by BIGINT UNSIGNED NULL,
 granted_at DATETIME(3) NOT NULL,
 UNIQUE KEY uq_retake_quiz_nis (quiz_id, nis),
 CONSTRAINT fk_rp_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
 CONSTRAINT fk_rp_teacher FOREIGN KEY (granted_by) REFERENCES teachers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS time_extension_requests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 legacy_id VARCHAR(100) NULL,
 attempt_id BIGINT UNSIGNED NOT NULL,
 status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
 requested_at DATETIME(3) NOT NULL,
 reviewed_at DATETIME(3) NULL,
 reviewed_by BIGINT UNSIGNED NULL,
 added_minutes INT UNSIGNED NOT NULL DEFAULT 0,
 new_ends_at DATETIME(3) NULL,
 UNIQUE KEY uq_extension_attempt (attempt_id),
 KEY idx_ext_pending (status, requested_at),
 CONSTRAINT fk_ext_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
 CONSTRAINT fk_ext_teacher FOREIGN KEY (reviewed_by) REFERENCES teachers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 actor_type ENUM('teacher','student','system') NOT NULL DEFAULT 'system',
 teacher_id BIGINT UNSIGNED NULL,
 action VARCHAR(255) NOT NULL,
 target VARCHAR(500) NULL,
 detail TEXT NULL,
 created_at DATETIME(3) NOT NULL,
 KEY idx_audit_time (created_at),
 CONSTRAINT fk_audit_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS trash_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 entity_type ENUM('results','students','quizzes') NOT NULL,
 entity_id VARCHAR(100) NULL,
 payload_json JSON NOT NULL,
 deleted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 deleted_by BIGINT UNSIGNED NULL,
 restored_at DATETIME(3) NULL,
 KEY idx_trash_type_time (entity_type, deleted_at),
 CONSTRAINT fk_trash_teacher FOREIGN KEY (deleted_by) REFERENCES teachers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS backup_runs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 file_path VARCHAR(600) NOT NULL,
 checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 reason VARCHAR(150) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 status ENUM('STARTED','SUCCESS','FAILED') NOT NULL DEFAULT 'STARTED',
 KEY idx_backup_time (created_at)
) ENGINE=InnoDB;

-- Catatan implementasi:
-- 1) Migrator harus menghindari duplikasi import saat rerun; buat tabel migrasi/checkpoint terpisah bila diperlukan.
-- 2) Data legacy 'results' tanpa attempt id harus dibuatkan attempt historis sintetik sebelum INSERT exam_results.
-- 3) Data NULL/empty NIS: simpan NULL pada students.nis, namun snapshot legacy result/attempt tetap string.
-- 4) Untuk quiz PIN/teacher hash kompatibilitas original, jangan rehash nilai tanpa memperoleh plaintext.
-- 5) Retensi 5 hasil per NIS+quiz: implementasikan DALAM TRANSAKSI service, bukan constraint DDL.
-- 6) Privasi: simpan folder backup dan session di luar root publik.
