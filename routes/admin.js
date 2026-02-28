const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { sendExamInvitation } = require('../config/email');
const { isAdminAuthenticated } = require('../middleware/auth');

// Multer setup for question image uploads
const questionStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/questions/'),
  filename: (req, file, cb) => {
    const uniqueName = `q_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const questionUpload = multer({
  storage: questionStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype.split('/')[1]);
    if (ext || mime) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// ==================== DASHBOARD ====================

router.get('/admin/dashboard', isAdminAuthenticated, async (req, res) => {
  try {
    const [stats] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM ent_students) as total_students,
        (SELECT COUNT(*) FROM ent_sessions) as total_sessions,
        (SELECT COUNT(*) FROM ent_sessions WHERE status = 'in_progress') as active_sessions,
        (SELECT COUNT(*) FROM ent_sessions WHERE status IN ('submitted', 'auto_submitted')) as completed_sessions,
        (SELECT COUNT(*) FROM ent_results WHERE admin_status = 'flagged') as flagged_sessions,
        (SELECT COUNT(*) FROM ent_degrees) as total_degrees,
        (SELECT COUNT(*) FROM ent_exams) as total_exams,
        (SELECT COUNT(*) FROM ent_questions) as total_questions
    `);

    const [recentSessions] = await db.query(`
      SELECT es.*, s.name as student_name, s.application_id, e.title as exam_title,
             er.score, er.risk_score, er.confidence_score, er.admin_status,
             (SELECT COUNT(*) FROM ent_violations v WHERE v.session_id = es.id) as violation_count
      FROM ent_sessions es
      JOIN ent_students s ON es.student_id = s.id
      JOIN ent_exams e ON es.exam_id = e.id
      LEFT JOIN ent_results er ON er.session_id = es.id
      ORDER BY es.created_at DESC LIMIT 50
    `);

    res.render('admin/dashboard', {
      adminName: req.session.adminName,
      activePage: 'dashboard',
      stats: stats[0],
      sessions: recentSessions
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.redirect('/admin/login');
  }
});

// ==================== DEGREES / PROGRAMS ====================

router.get('/admin/degrees', isAdminAuthenticated, async (req, res) => {
  try {
    const [degrees] = await db.query(`
      SELECT d.*, (SELECT COUNT(*) FROM ent_exams e WHERE e.degree_id = d.id) as exam_count
      FROM ent_degrees d ORDER BY d.name
    `);
    res.render('admin/degrees', { adminName: req.session.adminName, activePage: 'degrees', degrees });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});

router.post('/admin/degrees/create', isAdminAuthenticated, async (req, res) => {
  try {
    const { name, code, description, department, duration_years } = req.body;
    await db.query(
      'INSERT INTO ent_degrees (name, code, description, department, duration_years) VALUES (?, ?, ?, ?, ?)',
      [name, code, description || null, department || null, duration_years || 4]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.code === 'ER_DUP_ENTRY' ? 'Degree code already exists' : 'Failed to create degree' });
  }
});

router.post('/admin/degrees/:id/update', isAdminAuthenticated, async (req, res) => {
  try {
    const { name, code, description, department, duration_years, is_active } = req.body;
    await db.query(
      'UPDATE ent_degrees SET name=?, code=?, description=?, department=?, duration_years=?, is_active=? WHERE id=?',
      [name, code, description || null, department || null, duration_years || 4, is_active ? 1 : 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to update degree' });
  }
});

router.post('/admin/degrees/:id/delete', isAdminAuthenticated, async (req, res) => {
  try {
    await db.query('DELETE FROM ent_degrees WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Cannot delete degree with linked exams' });
  }
});

// ==================== QUESTION PAPERS (EXAMS) ====================

router.get('/admin/exams', isAdminAuthenticated, async (req, res) => {
  try {
    const [exams] = await db.query(`
      SELECT e.*, d.name as degree_name, d.code as degree_code,
             (SELECT COUNT(*) FROM ent_sections s WHERE s.exam_id = e.id) as section_count,
             (SELECT COUNT(*) FROM ent_questions q WHERE q.exam_id = e.id) as question_count
      FROM ent_exams e
      LEFT JOIN ent_degrees d ON e.degree_id = d.id
      ORDER BY e.created_at DESC
    `);
    const [degrees] = await db.query('SELECT * FROM ent_degrees WHERE is_active = 1 ORDER BY name');
    res.render('admin/exams', { adminName: req.session.adminName, activePage: 'exams', exams, degrees });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});

router.post('/admin/exams/create', isAdminAuthenticated, async (req, res) => {
  try {
    const {
      title, exam_code, description, instructions, degree_id,
      duration_minutes, total_questions, total_marks, passing_marks,
      negative_marking, negative_mark_value, shuffle_questions,
      show_result_immediately, max_tab_switches, max_violations,
      auto_save_interval, exam_date, start_time, end_time
    } = req.body;

    const [result] = await db.query(
      `INSERT INTO ent_exams (title, exam_code, description, instructions, degree_id,
        duration_minutes, total_questions, total_marks, passing_marks,
        negative_marking, negative_mark_value, shuffle_questions,
        show_result_immediately, max_tab_switches, max_violations,
        auto_save_interval, exam_date, start_time, end_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, exam_code || null, description || null, instructions || null,
       degree_id || null, duration_minutes || 60, total_questions || 0,
       total_marks || 100, passing_marks || 40,
       negative_marking ? 1 : 0, negative_mark_value || 0.25,
       shuffle_questions ? 1 : 0, show_result_immediately ? 1 : 0,
       max_tab_switches || 5, max_violations || 10,
       auto_save_interval || 15, exam_date || null, start_time || null, end_time || null]
    );
    res.json({ success: true, examId: result.insertId });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to create exam' });
  }
});

router.post('/admin/exams/:id/update', isAdminAuthenticated, async (req, res) => {
  try {
    const {
      title, exam_code, description, instructions, degree_id,
      duration_minutes, total_questions, total_marks, passing_marks,
      negative_marking, negative_mark_value, shuffle_questions,
      show_result_immediately, max_tab_switches, max_violations,
      auto_save_interval, exam_date, start_time, end_time, is_active
    } = req.body;

    await db.query(
      `UPDATE ent_exams SET title=?, exam_code=?, description=?, instructions=?, degree_id=?,
        duration_minutes=?, total_questions=?, total_marks=?, passing_marks=?,
        negative_marking=?, negative_mark_value=?, shuffle_questions=?,
        show_result_immediately=?, max_tab_switches=?, max_violations=?,
        auto_save_interval=?, exam_date=?, start_time=?, end_time=?, is_active=?
       WHERE id=?`,
      [title, exam_code || null, description || null, instructions || null,
       degree_id || null, duration_minutes || 60, total_questions || 0,
       total_marks || 100, passing_marks || 40,
       negative_marking ? 1 : 0, negative_mark_value || 0.25,
       shuffle_questions ? 1 : 0, show_result_immediately ? 1 : 0,
       max_tab_switches || 5, max_violations || 10,
       auto_save_interval || 15, exam_date || null, start_time || null, end_time || null,
       is_active ? 1 : 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to update exam' });
  }
});

router.post('/admin/exams/:id/delete', isAdminAuthenticated, async (req, res) => {
  try {
    await db.query('DELETE FROM ent_exams WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Cannot delete exam with active sessions' });
  }
});

// ==================== EXAM DETAIL (PAPER CONFIG) ====================

router.get('/admin/exams/:id', isAdminAuthenticated, async (req, res) => {
  try {
    const [exams] = await db.query(`
      SELECT e.*, d.name as degree_name, d.code as degree_code
      FROM ent_exams e LEFT JOIN ent_degrees d ON e.degree_id = d.id
      WHERE e.id = ?
    `, [req.params.id]);
    if (exams.length === 0) return res.redirect('/admin/exams');

    const [sections] = await db.query(`
      SELECT s.*, (SELECT COUNT(*) FROM ent_questions q WHERE q.section_id = s.id) as actual_questions
      FROM ent_sections s WHERE s.exam_id = ? ORDER BY s.sort_order
    `, [req.params.id]);

    const [questions] = await db.query(`
      SELECT q.*, s.title as section_title FROM ent_questions q
      LEFT JOIN ent_sections s ON q.section_id = s.id
      WHERE q.exam_id = ? ORDER BY q.sort_order
    `, [req.params.id]);

    const [degrees] = await db.query('SELECT * FROM ent_degrees WHERE is_active = 1 ORDER BY name');

    res.render('admin/exam-detail', {
      adminName: req.session.adminName,
      activePage: 'exams',
      exam: exams[0],
      sections,
      questions,
      degrees
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/exams');
  }
});

// ==================== SECTIONS ====================

router.post('/admin/exams/:examId/sections/create', isAdminAuthenticated, async (req, res) => {
  try {
    const { title, section_type, description, num_questions, marks_per_question, time_limit_minutes, is_mandatory, shuffle_questions } = req.body;

    const [maxOrder] = await db.query('SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM ent_sections WHERE exam_id = ?', [req.params.examId]);
    const totalMarks = (num_questions || 0) * (marks_per_question || 1);

    const [result] = await db.query(
      `INSERT INTO ent_sections (exam_id, title, section_type, description, num_questions, marks_per_question, total_marks, time_limit_minutes, is_mandatory, shuffle_questions, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.examId, title, section_type || 'mcq', description || null,
       num_questions || 0, marks_per_question || 1, totalMarks,
       time_limit_minutes || 0, is_mandatory ? 1 : 0, shuffle_questions ? 1 : 0,
       maxOrder[0].next_order]
    );

    // Recalculate exam totals
    await recalcExamTotals(req.params.examId);

    res.json({ success: true, sectionId: result.insertId });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to create section' });
  }
});

router.post('/admin/sections/:id/update', isAdminAuthenticated, async (req, res) => {
  try {
    const { title, section_type, description, num_questions, marks_per_question, time_limit_minutes, is_mandatory, shuffle_questions, sort_order } = req.body;
    const totalMarks = (num_questions || 0) * (marks_per_question || 1);

    await db.query(
      `UPDATE ent_sections SET title=?, section_type=?, description=?, num_questions=?, marks_per_question=?, total_marks=?, time_limit_minutes=?, is_mandatory=?, shuffle_questions=?, sort_order=? WHERE id=?`,
      [title, section_type || 'mcq', description || null,
       num_questions || 0, marks_per_question || 1, totalMarks,
       time_limit_minutes || 0, is_mandatory ? 1 : 0, shuffle_questions ? 1 : 0,
       sort_order || 0, req.params.id]
    );

    // Recalculate exam totals
    const [sec] = await db.query('SELECT exam_id FROM ent_sections WHERE id = ?', [req.params.id]);
    if (sec.length > 0) await recalcExamTotals(sec[0].exam_id);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to update section' });
  }
});

router.post('/admin/sections/:id/delete', isAdminAuthenticated, async (req, res) => {
  try {
    const [sec] = await db.query('SELECT exam_id FROM ent_sections WHERE id = ?', [req.params.id]);
    await db.query('DELETE FROM ent_sections WHERE id = ?', [req.params.id]);
    if (sec.length > 0) await recalcExamTotals(sec[0].exam_id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to delete section' });
  }
});

// ==================== QUESTIONS ====================

router.get('/admin/exams/:examId/questions/add', isAdminAuthenticated, async (req, res) => {
  try {
    const [exams] = await db.query('SELECT * FROM ent_exams WHERE id = ?', [req.params.examId]);
    if (exams.length === 0) return res.redirect('/admin/exams');

    const [sections] = await db.query('SELECT * FROM ent_sections WHERE exam_id = ? ORDER BY sort_order', [req.params.examId]);

    res.render('admin/question-form', {
      adminName: req.session.adminName,
      activePage: 'exams',
      exam: exams[0],
      sections,
      question: null,
      sectionId: req.query.section_id || null
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/exams/' + req.params.examId);
  }
});

router.get('/admin/questions/:id/edit', isAdminAuthenticated, async (req, res) => {
  try {
    const [questions] = await db.query('SELECT * FROM ent_questions WHERE id = ?', [req.params.id]);
    if (questions.length === 0) return res.redirect('/admin/exams');

    const question = questions[0];
    const [exams] = await db.query('SELECT * FROM ent_exams WHERE id = ?', [question.exam_id]);
    const [sections] = await db.query('SELECT * FROM ent_sections WHERE exam_id = ? ORDER BY sort_order', [question.exam_id]);

    res.render('admin/question-form', {
      adminName: req.session.adminName,
      activePage: 'exams',
      exam: exams[0],
      sections,
      question,
      sectionId: question.section_id
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/exams');
  }
});

router.post('/admin/exams/:examId/questions/create', isAdminAuthenticated, questionUpload.single('question_image'), async (req, res) => {
  try {
    const {
      section_id, question_type, difficulty, question_text,
      option_a, option_b, option_c, option_d, correct_option,
      explanation, marks, allowed_file_types, max_file_size_mb,
      min_word_count, max_word_count
    } = req.body;

    const questionImage = req.file ? `/uploads/questions/${req.file.filename}` : null;
    const [maxOrder] = await db.query('SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM ent_questions WHERE exam_id = ?', [req.params.examId]);

    await db.query(
      `INSERT INTO ent_questions (exam_id, section_id, question_type, difficulty, question_text,
        question_image, option_a, option_b, option_c, option_d, correct_option, explanation,
        allowed_file_types, max_file_size_mb, min_word_count, max_word_count, marks, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.examId, section_id || null, question_type || 'mcq', difficulty || 'medium',
       question_text, questionImage, option_a || null, option_b || null, option_c || null, option_d || null,
       correct_option || null, explanation || null,
       allowed_file_types || 'pdf,jpg,jpeg,png', max_file_size_mb || 10,
       min_word_count || 0, max_word_count || 0,
       marks || 1, maxOrder[0].next_order]
    );

    await recalcExamTotals(req.params.examId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to create question' });
  }
});

router.post('/admin/questions/:id/update', isAdminAuthenticated, questionUpload.single('question_image'), async (req, res) => {
  try {
    const {
      section_id, question_type, difficulty, question_text,
      option_a, option_b, option_c, option_d, correct_option,
      explanation, marks, sort_order, remove_image,
      allowed_file_types, max_file_size_mb, min_word_count, max_word_count
    } = req.body;

    let questionImage;
    if (req.file) {
      questionImage = `/uploads/questions/${req.file.filename}`;
    } else if (remove_image === '1') {
      questionImage = null;
    }

    if (questionImage !== undefined) {
      await db.query(
        `UPDATE ent_questions SET section_id=?, question_type=?, difficulty=?, question_text=?,
          question_image=?, option_a=?, option_b=?, option_c=?, option_d=?, correct_option=?,
          explanation=?, allowed_file_types=?, max_file_size_mb=?, min_word_count=?, max_word_count=?,
          marks=?, sort_order=? WHERE id=?`,
        [section_id || null, question_type || 'mcq', difficulty || 'medium',
         question_text, questionImage, option_a || null, option_b || null, option_c || null, option_d || null,
         correct_option || null, explanation || null,
         allowed_file_types || 'pdf,jpg,jpeg,png', max_file_size_mb || 10,
         min_word_count || 0, max_word_count || 0,
         marks || 1, sort_order || 0, req.params.id]
      );
    } else {
      await db.query(
        `UPDATE ent_questions SET section_id=?, question_type=?, difficulty=?, question_text=?,
          option_a=?, option_b=?, option_c=?, option_d=?, correct_option=?,
          explanation=?, allowed_file_types=?, max_file_size_mb=?, min_word_count=?, max_word_count=?,
          marks=?, sort_order=? WHERE id=?`,
        [section_id || null, question_type || 'mcq', difficulty || 'medium',
         question_text, option_a || null, option_b || null, option_c || null, option_d || null,
         correct_option || null, explanation || null,
         allowed_file_types || 'pdf,jpg,jpeg,png', max_file_size_mb || 10,
         min_word_count || 0, max_word_count || 0,
         marks || 1, sort_order || 0, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to update question' });
  }
});

router.post('/admin/questions/:id/delete', isAdminAuthenticated, async (req, res) => {
  try {
    const [q] = await db.query('SELECT exam_id FROM ent_questions WHERE id = ?', [req.params.id]);
    await db.query('DELETE FROM ent_questions WHERE id = ?', [req.params.id]);
    if (q.length > 0) await recalcExamTotals(q[0].exam_id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to delete question' });
  }
});

// ==================== SESSIONS LIST ====================

router.get('/admin/sessions', isAdminAuthenticated, async (req, res) => {
  try {
    const [sessions] = await db.query(`
      SELECT es.*, s.name as student_name, s.application_id, e.title as exam_title,
             er.score, er.risk_score, er.confidence_score, er.admin_status,
             (SELECT COUNT(*) FROM ent_violations v WHERE v.session_id = es.id) as violation_count
      FROM ent_sessions es
      JOIN ent_students s ON es.student_id = s.id
      JOIN ent_exams e ON es.exam_id = e.id
      LEFT JOIN ent_results er ON er.session_id = es.id
      ORDER BY es.created_at DESC LIMIT 100
    `);
    res.render('admin/sessions', { adminName: req.session.adminName, activePage: 'sessions', sessions });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});

// View session details
router.get('/admin/session/:id', isAdminAuthenticated, async (req, res) => {
  try {
    const [sessions] = await db.query(`
      SELECT es.*, s.name as student_name, s.application_id, s.email, s.mobile,
             e.title as exam_title, e.duration_minutes, e.total_questions,
             er.total_answered, er.correct_answers, er.score, er.risk_score,
             er.confidence_score, er.admin_status, er.admin_notes
      FROM ent_sessions es
      JOIN ent_students s ON es.student_id = s.id
      JOIN ent_exams e ON es.exam_id = e.id
      LEFT JOIN ent_results er ON er.session_id = es.id
      WHERE es.id = ?
    `, [req.params.id]);

    if (sessions.length === 0) return res.redirect('/admin/dashboard');

    const [violations] = await db.query(
      'SELECT * FROM ent_violations WHERE session_id = ? ORDER BY timestamp',
      [req.params.id]
    );

    const [violationSummary] = await db.query(
      'SELECT type, COUNT(*) as count FROM ent_violations WHERE session_id = ? GROUP BY type',
      [req.params.id]
    );

    const [responses] = await db.query(`
      SELECT r.*, r.uploaded_file_url, q.question_text, q.question_type, q.correct_option, q.marks,
             s.title as section_title
      FROM ent_responses r
      JOIN ent_questions q ON r.question_id = q.id
      LEFT JOIN ent_sections s ON q.section_id = s.id
      WHERE r.session_id = ?
      ORDER BY q.sort_order
    `, [req.params.id]);

    const [logs] = await db.query(
      'SELECT * FROM ent_proctoring_logs WHERE session_id = ? ORDER BY created_at',
      [req.params.id]
    );

    res.render('admin/session-detail', {
      adminName: req.session.adminName,
      activePage: 'sessions',
      session: sessions[0],
      violations,
      violationSummary,
      responses,
      logs
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});

// Update session status
router.post('/admin/session/:id/update', isAdminAuthenticated, async (req, res) => {
  try {
    const { admin_status, admin_notes } = req.body;
    await db.query(
      `UPDATE ent_results SET admin_status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE session_id = ?`,
      [admin_status, admin_notes, req.session.adminId, req.params.id]
    );

    if (admin_status === 'disqualified') {
      await db.query('UPDATE ent_sessions SET status = "disqualified" WHERE id = ?', [req.params.id]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

// ==================== STUDENTS ====================

router.get('/admin/students', isAdminAuthenticated, async (req, res) => {
  try {
    const [students] = await db.query(`
      SELECT s.*, (SELECT COUNT(*) FROM ent_sessions es WHERE es.student_id = s.id) as session_count
      FROM ent_students s ORDER BY s.created_at DESC
    `);
    res.render('admin/students', { adminName: req.session.adminName, activePage: 'students', students });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});

router.post('/admin/students/create', isAdminAuthenticated, async (req, res) => {
  try {
    const { application_id, name, email, mobile, password } = req.body;
    if (!application_id || !name || !mobile || !password) {
      return res.json({ success: false, error: 'Application ID, name, mobile, and password are required' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO ent_students (application_id, name, email, mobile, password) VALUES (?, ?, ?, ?, ?)',
      [application_id, name, email || null, mobile, hashedPassword]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.code === 'ER_DUP_ENTRY' ? 'Application ID already exists' : 'Failed to create student' });
  }
});

router.post('/admin/students/:id/update', isAdminAuthenticated, async (req, res) => {
  try {
    const { application_id, name, email, mobile, password } = req.body;
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.query(
        'UPDATE ent_students SET application_id=?, name=?, email=?, mobile=?, password=? WHERE id=?',
        [application_id, name, email || null, mobile, hashedPassword, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE ent_students SET application_id=?, name=?, email=?, mobile=? WHERE id=?',
        [application_id, name, email || null, mobile, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.code === 'ER_DUP_ENTRY' ? 'Application ID already exists' : 'Failed to update student' });
  }
});

router.post('/admin/students/:id/delete', isAdminAuthenticated, async (req, res) => {
  try {
    await db.query('DELETE FROM ent_students WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Cannot delete student with active exam sessions' });
  }
});

// ==================== REASSIGN TEST ====================

// Get student's exam sessions (for reassign modal)
router.get('/admin/students/:id/sessions', isAdminAuthenticated, async (req, res) => {
  try {
    const [sessions] = await db.query(`
      SELECT es.id as session_id, es.exam_id, es.status, es.created_at, es.started_at, es.submitted_at,
             e.title as exam_title,
             er.score, er.total_answered, er.correct_answers, er.admin_status
      FROM ent_sessions es
      JOIN ent_exams e ON es.exam_id = e.id
      LEFT JOIN ent_results er ON er.session_id = es.id
      WHERE es.student_id = ?
      ORDER BY es.created_at DESC
    `, [req.params.id]);
    res.json({ success: true, sessions });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to fetch sessions' });
  }
});

// Reassign test - delete old session(s) for student+exam so student can retake
router.post('/admin/students/:id/reassign-test', isAdminAuthenticated, async (req, res) => {
  try {
    const { exam_id, send_email } = req.body;
    if (!exam_id) {
      return res.json({ success: false, error: 'Exam ID is required' });
    }

    const studentId = req.params.id;

    // Verify student exists
    const [students] = await db.query('SELECT * FROM ent_students WHERE id = ?', [studentId]);
    if (students.length === 0) {
      return res.json({ success: false, error: 'Student not found' });
    }
    const student = students[0];

    // Delete all sessions for this student+exam (cascades to responses, violations, logs, results)
    const [deleteResult] = await db.query(
      'DELETE FROM ent_sessions WHERE student_id = ? AND exam_id = ?',
      [studentId, exam_id]
    );

    // Ensure the exam assignment still exists (re-create if needed)
    await db.query(
      'INSERT IGNORE INTO ent_exam_assignments (student_id, exam_id, assigned_by) VALUES (?, ?, ?)',
      [studentId, exam_id, req.session.adminId]
    );

    let emailSent = false;

    // Optionally send a new invitation email
    if (send_email && student.email) {
      try {
        const [exams] = await db.query('SELECT * FROM ent_exams WHERE id = ?', [exam_id]);
        if (exams.length > 0) {
          const token = uuidv4();
          const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
          await db.query(
            'INSERT INTO ent_login_tokens (student_id, token, exam_id, expires_at) VALUES (?, ?, ?, ?)',
            [studentId, token, exam_id, expiresAt]
          );
          await sendExamInvitation(student, exams[0], token);
          await db.query(
            'UPDATE ent_exam_assignments SET email_sent = 1, email_sent_at = NOW() WHERE student_id = ? AND exam_id = ?',
            [studentId, exam_id]
          );
          emailSent = true;
        }
      } catch (emailErr) {
        console.error('Failed to send reassignment email:', emailErr.message);
      }
    }

    res.json({
      success: true,
      deletedSessions: deleteResult.affectedRows,
      emailSent
    });
  } catch (err) {
    console.error('Reassign test error:', err);
    res.json({ success: false, error: 'Failed to reassign test' });
  }
});

// ==================== EXAM ASSIGNMENTS ====================

// View assignment page for an exam
router.get('/admin/exams/:examId/assignments', isAdminAuthenticated, async (req, res) => {
  try {
    const [exams] = await db.query('SELECT * FROM ent_exams WHERE id = ?', [req.params.examId]);
    if (exams.length === 0) return res.redirect('/admin/exams');

    // Get all students
    const [students] = await db.query('SELECT id, application_id, name, email, mobile FROM ent_students ORDER BY name');

    // Get current assignments for this exam
    const [assignments] = await db.query(
      `SELECT a.*, s.application_id, s.name, s.email, s.mobile
       FROM ent_exam_assignments a
       JOIN ent_students s ON a.student_id = s.id
       WHERE a.exam_id = ?
       ORDER BY a.assigned_at DESC`,
      [req.params.examId]
    );

    const [degrees] = await db.query('SELECT * FROM ent_degrees WHERE is_active = 1 ORDER BY name');

    res.render('admin/exam-assignments', {
      adminName: req.session.adminName,
      activePage: 'exams',
      exam: exams[0],
      students,
      assignments,
      degrees
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/exams');
  }
});

// Assign students to exam (and send invitation emails)
router.post('/admin/exams/:examId/assign', isAdminAuthenticated, async (req, res) => {
  try {
    const { student_ids } = req.body;
    if (!student_ids || student_ids.length === 0) {
      return res.json({ success: false, error: 'No students selected' });
    }

    // Fetch exam details for the email
    const [exams] = await db.query('SELECT * FROM ent_exams WHERE id = ?', [req.params.examId]);
    if (exams.length === 0) return res.json({ success: false, error: 'Exam not found' });
    const exam = exams[0];

    let assignedCount = 0;
    let emailSentCount = 0;
    let emailFailedCount = 0;
    const emailErrors = [];

    for (const studentId of student_ids) {
      try {
        const [result] = await db.query(
          'INSERT IGNORE INTO ent_exam_assignments (student_id, exam_id, assigned_by) VALUES (?, ?, ?)',
          [studentId, req.params.examId, req.session.adminId]
        );

        if (result.affectedRows === 0) continue; // Already assigned, skip
        assignedCount++;

        // Fetch student details for the email
        const [students] = await db.query(
          'SELECT * FROM ent_students WHERE id = ? AND email IS NOT NULL AND email != ""',
          [studentId]
        );

        if (students.length === 0) continue; // No email, skip
        const student = students[0];

        try {
          // Generate unique token (expires in 72 hours)
          const token = uuidv4();
          const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

          await db.query(
            'INSERT INTO ent_login_tokens (student_id, token, exam_id, expires_at) VALUES (?, ?, ?, ?)',
            [student.id, token, req.params.examId, expiresAt]
          );

          // Send invitation email
          await sendExamInvitation(student, exam, token);

          // Mark email as sent on the assignment
          await db.query(
            'UPDATE ent_exam_assignments SET email_sent = 1, email_sent_at = NOW() WHERE student_id = ? AND exam_id = ?',
            [studentId, req.params.examId]
          );

          emailSentCount++;
        } catch (emailErr) {
          console.error(`Failed to send email to ${student.email}:`, emailErr.message);
          emailFailedCount++;
          emailErrors.push(`${student.name} (${student.email}): ${emailErr.message}`);
        }
      } catch (e) {
        // Skip duplicates
      }
    }

    res.json({
      success: true,
      assignedCount,
      emailSentCount,
      emailFailedCount,
      emailErrors: emailErrors.length > 0 ? emailErrors : undefined
    });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to assign students' });
  }
});

// Remove assignment
router.post('/admin/assignments/:id/remove', isAdminAuthenticated, async (req, res) => {
  try {
    await db.query('DELETE FROM ent_exam_assignments WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to remove assignment' });
  }
});

// Send exam emails to assigned students (all or specific)
router.post('/admin/exams/:examId/send-emails', isAdminAuthenticated, async (req, res) => {
  try {
    const { student_ids } = req.body; // optional: specific student IDs, or empty for all

    const [exams] = await db.query('SELECT * FROM ent_exams WHERE id = ?', [req.params.examId]);
    if (exams.length === 0) return res.json({ success: false, error: 'Exam not found' });
    const exam = exams[0];

    // Get students to email
    let query, params;
    if (student_ids && student_ids.length > 0) {
      query = `SELECT a.id as assignment_id, s.* FROM ent_exam_assignments a
               JOIN ent_students s ON a.student_id = s.id
               WHERE a.exam_id = ? AND s.id IN (?) AND s.email IS NOT NULL AND s.email != ''`;
      params = [req.params.examId, student_ids];
    } else {
      query = `SELECT a.id as assignment_id, s.* FROM ent_exam_assignments a
               JOIN ent_students s ON a.student_id = s.id
               WHERE a.exam_id = ? AND s.email IS NOT NULL AND s.email != ''`;
      params = [req.params.examId];
    }

    const [students] = await db.query(query, params);

    if (students.length === 0) {
      return res.json({ success: false, error: 'No students with email addresses found' });
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const student of students) {
      try {
        // Generate unique token (expires in 72 hours)
        const token = uuidv4();
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

        await db.query(
          'INSERT INTO ent_login_tokens (student_id, token, exam_id, expires_at) VALUES (?, ?, ?, ?)',
          [student.id, token, req.params.examId, expiresAt]
        );

        // Send email
        await sendExamInvitation(student, exam, token);

        // Mark email as sent
        await db.query(
          'UPDATE ent_exam_assignments SET email_sent = 1, email_sent_at = NOW() WHERE id = ?',
          [student.assignment_id]
        );

        sentCount++;
      } catch (emailErr) {
        console.error(`Failed to send email to ${student.email}:`, emailErr.message);
        failedCount++;
        errors.push(`${student.name} (${student.email}): ${emailErr.message}`);
      }
    }

    res.json({
      success: true,
      sentCount,
      failedCount,
      totalStudents: students.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to send emails' });
  }
});

// ==================== HELPER ====================

async function recalcExamTotals(examId) {
  const [totals] = await db.query(`
    SELECT COALESCE(SUM(s.num_questions), 0) as total_q, COALESCE(SUM(s.total_marks), 0) as total_m
    FROM ent_sections s WHERE s.exam_id = ?
  `, [examId]);
  await db.query('UPDATE ent_exams SET total_questions = ?, total_marks = ? WHERE id = ?',
    [totals[0].total_q, totals[0].total_m, examId]);
}

module.exports = router;
