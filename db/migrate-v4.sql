USE entrance_exam;

-- Exam assignment table: maps students to exams
CREATE TABLE IF NOT EXISTS ent_exam_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  exam_id INT NOT NULL,
  assigned_by INT,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  email_sent TINYINT(1) DEFAULT 0,
  email_sent_at TIMESTAMP NULL,
  FOREIGN KEY (student_id) REFERENCES ent_students(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id) REFERENCES ent_exams(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES ent_admins(id) ON DELETE SET NULL,
  UNIQUE KEY unique_assignment (student_id, exam_id)
);

-- Login tokens for auto-login via email link
CREATE TABLE IF NOT EXISTS ent_login_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  token VARCHAR(100) NOT NULL UNIQUE,
  exam_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  FOREIGN KEY (student_id) REFERENCES ent_students(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id) REFERENCES ent_exams(id) ON DELETE CASCADE
);

-- Add index for fast token lookup
CREATE INDEX idx_token ON ent_login_tokens(token);
CREATE INDEX idx_token_expiry ON ent_login_tokens(token, expires_at);
