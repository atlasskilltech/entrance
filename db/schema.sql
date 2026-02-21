CREATE DATABASE IF NOT EXISTS entrance_exam;
USE entrance_exam;

-- Admin users table
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students table
CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  application_id VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  mobile VARCHAR(20) NOT NULL,
  password VARCHAR(255) NOT NULL,
  photo_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Exams table
CREATE TABLE IF NOT EXISTS exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL DEFAULT 60,
  total_questions INT NOT NULL DEFAULT 20,
  max_tab_switches INT DEFAULT 5,
  max_violations INT DEFAULT 10,
  auto_save_interval INT DEFAULT 15,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sections table
CREATE TABLE IF NOT EXISTS sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  sort_order INT DEFAULT 0,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

-- Questions table
CREATE TABLE IF NOT EXISTS questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  section_id INT,
  question_text TEXT NOT NULL,
  question_image VARCHAR(500),
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  correct_option CHAR(1),
  marks INT DEFAULT 1,
  sort_order INT DEFAULT 0,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL
);

-- Entrance sessions table
CREATE TABLE IF NOT EXISTS ent_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  exam_id INT NOT NULL,
  status ENUM('compatibility_check', 'av_verification', 'rules', 'in_progress', 'submitted', 'auto_submitted', 'disqualified') DEFAULT 'compatibility_check',
  base_photo_url VARCHAR(500),
  ip_address VARCHAR(50),
  user_agent TEXT,
  browser_info VARCHAR(200),
  screen_resolution VARCHAR(50),
  started_at TIMESTAMP NULL,
  submitted_at TIMESTAMP NULL,
  time_remaining_seconds INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

-- Student responses table
CREATE TABLE IF NOT EXISTS responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  question_id INT NOT NULL,
  selected_option CHAR(1),
  marked_for_review TINYINT(1) DEFAULT 0,
  answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ent_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  UNIQUE KEY unique_response (session_id, question_id)
);

-- Violations table
CREATE TABLE IF NOT EXISTS violations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  type ENUM('tab_switch', 'copy', 'paste', 'multiple_faces', 'face_not_visible', 'fullscreen_exit', 'inactivity', 'other') NOT NULL,
  details TEXT,
  severity ENUM('low', 'medium', 'high') DEFAULT 'medium',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ent_sessions(id) ON DELETE CASCADE
);

-- Proctoring logs table
CREATE TABLE IF NOT EXISTS proctoring_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  event_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ent_sessions(id) ON DELETE CASCADE
);

-- Entrance results / risk score table
CREATE TABLE IF NOT EXISTS ent_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL UNIQUE,
  total_answered INT DEFAULT 0,
  correct_answers INT DEFAULT 0,
  score DECIMAL(5,2) DEFAULT 0,
  risk_score DECIMAL(5,2) DEFAULT 0,
  confidence_score DECIMAL(5,2) DEFAULT 100,
  admin_status ENUM('pending', 'approved', 'flagged', 'disqualified') DEFAULT 'pending',
  admin_notes TEXT,
  reviewed_by INT,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ent_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES admins(id) ON DELETE SET NULL
);

-- Insert default admin
INSERT INTO admins (username, password, name) VALUES
('admin', '$2a$10$8K1p/a0dL1LXMYgoLQH05.FGpO4hFkIJYDRwuSp.s8Xy.IGuMnTG', 'Administrator');
-- Default password: admin123

-- Insert a sample exam
INSERT INTO exams (title, description, duration_minutes, total_questions, max_tab_switches, max_violations) VALUES
('Design Aptitude Test 2024', 'Online Entrance Examination - Design Aptitude Test (Proctored Mode)', 60, 20, 5, 10);

-- Insert sections for the sample exam
INSERT INTO sections (exam_id, title, sort_order) VALUES
(1, 'Section A - Visual Perception', 1),
(1, 'Section B - Design Thinking', 2),
(1, 'Section C - Creative Aptitude', 3);

-- Insert sample questions
INSERT INTO questions (exam_id, section_id, question_text, option_a, option_b, option_c, option_d, correct_option, sort_order) VALUES
(1, 1, 'Which color combination creates the highest visual contrast?', 'Black and White', 'Blue and Green', 'Red and Orange', 'Yellow and Cream', 'A', 1),
(1, 1, 'What is the golden ratio approximately equal to?', '1.414', '1.618', '2.236', '3.142', 'B', 2),
(1, 1, 'Which principle of design refers to the visual weight of elements?', 'Rhythm', 'Balance', 'Unity', 'Emphasis', 'B', 3),
(1, 1, 'In color theory, what are the primary colors in the RGB model?', 'Red, Yellow, Blue', 'Red, Green, Blue', 'Cyan, Magenta, Yellow', 'Red, Orange, Violet', 'B', 4),
(1, 1, 'What type of perspective uses a single vanishing point?', 'Two-point perspective', 'One-point perspective', 'Three-point perspective', 'Isometric perspective', 'B', 5),
(1, 1, 'Which element of design refers to the path of a moving point?', 'Shape', 'Line', 'Form', 'Texture', 'B', 6),
(1, 1, 'The rule of thirds is commonly used in which aspect of design?', 'Typography', 'Composition', 'Color theory', 'Branding', 'B', 7),
(1, 2, 'What is the primary goal of user-centered design?', 'Maximize profits', 'Focus on user needs', 'Reduce development time', 'Increase visual appeal', 'B', 8),
(1, 2, 'Which design methodology involves rapid prototyping and iteration?', 'Waterfall', 'Design Thinking', 'V-Model', 'Spiral Model', 'B', 9),
(1, 2, 'What does the term "whitespace" refer to in design?', 'White colored areas', 'Empty space between elements', 'Background color', 'Page margins only', 'B', 10),
(1, 2, 'Which typography term describes the space between lines of text?', 'Kerning', 'Tracking', 'Leading', 'Baseline', 'C', 11),
(1, 2, 'What is a mood board used for in the design process?', 'Project scheduling', 'Visual inspiration collection', 'Budget planning', 'Client invoicing', 'B', 12),
(1, 2, 'In UX design, what does a wireframe represent?', 'Final design', 'Basic layout structure', 'Color scheme', 'Animation plan', 'B', 13),
(1, 2, 'Which file format supports transparency?', 'JPEG', 'PNG', 'BMP', 'TIFF', 'B', 14),
(1, 3, 'What does "CMYK" stand for in printing?', 'Color, Margin, Yellow, Key', 'Cyan, Magenta, Yellow, Key', 'Cyan, Margin, Yellow, Kelvin', 'Color, Magenta, Yield, Key', 'B', 15),
(1, 3, 'Which art movement is known for geometric abstraction?', 'Impressionism', 'Cubism', 'Romanticism', 'Realism', 'B', 16),
(1, 3, 'What is the purpose of a grid system in design?', 'Add decoration', 'Create structure and alignment', 'Increase file size', 'Limit creativity', 'B', 17),
(1, 3, 'Which design principle creates a sense of movement?', 'Symmetry', 'Rhythm', 'Proximity', 'Alignment', 'B', 18),
(1, 3, 'What is the complementary color of blue?', 'Green', 'Orange', 'Purple', 'Red', 'B', 19),
(1, 3, 'Bauhaus school of design originated in which country?', 'France', 'Germany', 'Italy', 'USA', 'B', 20);

-- Insert a sample student
INSERT INTO students (application_id, name, email, mobile, password) VALUES
('APP2024001', 'John Doe', 'john@example.com', '9876543210', '$2a$10$8K1p/a0dL1LXMYgoLQH05.FGpO4hFkIJYDRwuSp.s8Xy.IGuMnTG');
-- Default password: admin123
