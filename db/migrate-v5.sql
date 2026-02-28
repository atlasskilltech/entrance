USE entrance_exam;

-- Add exam_rules and question_instructions to ent_exams
ALTER TABLE ent_exams
  ADD COLUMN IF NOT EXISTS exam_rules TEXT AFTER instructions,
  ADD COLUMN IF NOT EXISTS question_instructions TEXT AFTER exam_rules;
