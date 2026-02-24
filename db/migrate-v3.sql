USE entrance_exam;

-- Add file_upload and summary_writing to section types
ALTER TABLE ent_sections
  MODIFY COLUMN section_type ENUM('mcq', 'true_false', 'fill_blank', 'descriptive', 'image_based', 'matching', 'file_upload', 'summary_writing') DEFAULT 'mcq';

-- Add file_upload and summary_writing to question types
ALTER TABLE ent_questions
  MODIFY COLUMN question_type ENUM('mcq', 'true_false', 'fill_blank', 'descriptive', 'image_based', 'matching', 'file_upload', 'summary_writing') DEFAULT 'mcq';

-- Add file upload constraints to questions (for file_upload type)
ALTER TABLE ent_questions
  ADD COLUMN IF NOT EXISTS allowed_file_types VARCHAR(200) DEFAULT 'pdf,jpg,jpeg,png' AFTER explanation,
  ADD COLUMN IF NOT EXISTS max_file_size_mb INT DEFAULT 10 AFTER allowed_file_types;

-- Add word count constraints to questions (for summary_writing type)
ALTER TABLE ent_questions
  ADD COLUMN IF NOT EXISTS min_word_count INT DEFAULT 0 AFTER max_file_size_mb,
  ADD COLUMN IF NOT EXISTS max_word_count INT DEFAULT 0 AFTER min_word_count;

-- Add uploaded file URL to responses
ALTER TABLE ent_responses
  ADD COLUMN IF NOT EXISTS uploaded_file_url VARCHAR(500) NULL AFTER answer_text;
