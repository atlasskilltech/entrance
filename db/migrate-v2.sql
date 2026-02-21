USE entrance_exam;

-- Degrees / Programs table
CREATE TABLE IF NOT EXISTS ent_degrees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  department VARCHAR(200),
  duration_years INT DEFAULT 4,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add degree_id and paper configuration fields to ent_exams
ALTER TABLE ent_exams
  ADD COLUMN IF NOT EXISTS degree_id INT NULL AFTER id,
  ADD COLUMN IF NOT EXISTS exam_code VARCHAR(50) NULL AFTER title,
  ADD COLUMN IF NOT EXISTS total_marks INT DEFAULT 100 AFTER total_questions,
  ADD COLUMN IF NOT EXISTS passing_marks INT DEFAULT 40 AFTER total_marks,
  ADD COLUMN IF NOT EXISTS negative_marking TINYINT(1) DEFAULT 0 AFTER passing_marks,
  ADD COLUMN IF NOT EXISTS negative_mark_value DECIMAL(3,2) DEFAULT 0.25 AFTER negative_marking,
  ADD COLUMN IF NOT EXISTS shuffle_questions TINYINT(1) DEFAULT 0 AFTER negative_mark_value,
  ADD COLUMN IF NOT EXISTS show_result_immediately TINYINT(1) DEFAULT 0 AFTER shuffle_questions,
  ADD COLUMN IF NOT EXISTS instructions TEXT AFTER description,
  ADD COLUMN IF NOT EXISTS exam_date DATE NULL AFTER instructions,
  ADD COLUMN IF NOT EXISTS start_time TIME NULL AFTER exam_date,
  ADD COLUMN IF NOT EXISTS end_time TIME NULL AFTER start_time;

-- Add foreign key for degree (ignore error if already exists)
-- ALTER TABLE ent_exams ADD FOREIGN KEY (degree_id) REFERENCES ent_degrees(id) ON DELETE SET NULL;

-- Extend ent_sections with type, marks, question_count configuration
ALTER TABLE ent_sections
  ADD COLUMN IF NOT EXISTS section_type ENUM('mcq', 'true_false', 'fill_blank', 'descriptive', 'image_based', 'matching') DEFAULT 'mcq' AFTER title,
  ADD COLUMN IF NOT EXISTS description TEXT AFTER section_type,
  ADD COLUMN IF NOT EXISTS num_questions INT DEFAULT 0 AFTER description,
  ADD COLUMN IF NOT EXISTS marks_per_question INT DEFAULT 1 AFTER num_questions,
  ADD COLUMN IF NOT EXISTS total_marks INT DEFAULT 0 AFTER marks_per_question,
  ADD COLUMN IF NOT EXISTS time_limit_minutes INT DEFAULT 0 AFTER total_marks,
  ADD COLUMN IF NOT EXISTS is_mandatory TINYINT(1) DEFAULT 1 AFTER time_limit_minutes,
  ADD COLUMN IF NOT EXISTS shuffle_questions TINYINT(1) DEFAULT 0 AFTER is_mandatory;

-- Add difficulty level and question type to ent_questions
ALTER TABLE ent_questions
  ADD COLUMN IF NOT EXISTS question_type ENUM('mcq', 'true_false', 'fill_blank', 'descriptive', 'image_based', 'matching') DEFAULT 'mcq' AFTER section_id,
  ADD COLUMN IF NOT EXISTS difficulty ENUM('easy', 'medium', 'hard') DEFAULT 'medium' AFTER question_type,
  ADD COLUMN IF NOT EXISTS explanation TEXT AFTER correct_option;

-- Insert sample degrees
INSERT IGNORE INTO ent_degrees (name, code, description, department, duration_years) VALUES
('Bachelor of Design', 'B.Des', 'Bachelor of Design - Undergraduate Program', 'School of Design', 4),
('Bachelor of Fine Arts', 'BFA', 'Bachelor of Fine Arts - Undergraduate Program', 'School of Arts', 4),
('Master of Design', 'M.Des', 'Master of Design - Postgraduate Program', 'School of Design', 2),
('Bachelor of Architecture', 'B.Arch', 'Bachelor of Architecture - Undergraduate Program', 'School of Architecture', 5),
('Bachelor of Technology', 'B.Tech', 'Bachelor of Technology - Engineering Program', 'School of Engineering', 4);

-- Update existing exam to link with B.Des degree
UPDATE ent_exams SET degree_id = 1, exam_code = 'DAT-2024-001', total_marks = 20, passing_marks = 8 WHERE id = 1;

-- Update existing sections with type info
UPDATE ent_sections SET section_type = 'mcq', num_questions = 7, marks_per_question = 1, total_marks = 7 WHERE id = 1;
UPDATE ent_sections SET section_type = 'mcq', num_questions = 7, marks_per_question = 1, total_marks = 7 WHERE id = 2;
UPDATE ent_sections SET section_type = 'mcq', num_questions = 6, marks_per_question = 1, total_marks = 6 WHERE id = 3;
