const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../config/database');
const { isStudentAuthenticated, hasActiveSession } = require('../middleware/auth');

// Multer setup for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/photos/'),
  filename: (req, file, cb) => {
    const uniqueName = `${req.session.studentId}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Student dashboard
router.get('/dashboard', isStudentAuthenticated, async (req, res) => {
  try {
    const [exams] = await db.query('SELECT * FROM ent_exams WHERE is_active = 1');
    const [sessions] = await db.query(
      'SELECT * FROM ent_sessions WHERE student_id = ? ORDER BY created_at DESC',
      [req.session.studentId]
    );
    res.render('dashboard', {
      studentName: req.session.studentName,
      applicationId: req.session.applicationId,
      exams,
      sessions
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.redirect('/login');
  }
});

// Phase 2: Start exam - Bypass system compatibility check, go directly to A/V Check
router.get('/exam/:examId/start', isStudentAuthenticated, async (req, res) => {
  try {
    const [exams] = await db.query('SELECT * FROM ent_exams WHERE id = ? AND is_active = 1', [req.params.examId]);
    if (exams.length === 0) return res.redirect('/dashboard');

    // Check if student already has an active session
    const [existing] = await db.query(
      'SELECT * FROM ent_sessions WHERE student_id = ? AND exam_id = ? AND status NOT IN ("submitted", "auto_submitted", "disqualified")',
      [req.session.studentId, req.params.examId]
    );

    let sessionId;
    if (existing.length > 0) {
      sessionId = existing[0].id;
      req.session.examSessionId = sessionId;

      // Resume from current phase
      const session = existing[0];
      if (session.status === 'in_progress') {
        return res.redirect('/exam/live');
      }
      if (session.status === 'av_verification') {
        // A/V check bypassed - advance to rules
        await db.query('UPDATE ent_sessions SET status = "rules" WHERE id = ?', [sessionId]);
        return res.redirect('/exam/rules');
      }
      if (session.status === 'rules') {
        return res.redirect('/exam/rules');
      }
    } else {
      // Create new session
      const [result] = await db.query(
        'INSERT INTO ent_sessions (student_id, exam_id, ip_address, user_agent) VALUES (?, ?, ?, ?)',
        [req.session.studentId, req.params.examId, req.ip, req.headers['user-agent']]
      );
      sessionId = result.insertId;
      req.session.examSessionId = sessionId;
    }

    // Bypass compatibility check & A/V verification - skip directly to rules
    const browserInfo = req.headers['user-agent'] ? req.headers['user-agent'].substring(0, 200) : '';
    await db.query(
      'UPDATE ent_sessions SET status = "rules", browser_info = ? WHERE id = ?',
      [browserInfo, sessionId]
    );
    res.redirect('/exam/rules');
  } catch (err) {
    console.error('Start exam error:', err);
    res.redirect('/dashboard');
  }
});

// Phase 2 -> Phase 3: Save compatibility results
router.post('/exam/compatibility-done', isStudentAuthenticated, hasActiveSession, async (req, res) => {
  try {
    const { browser_info, screen_resolution } = req.body;
    await db.query(
      'UPDATE ent_sessions SET status = "av_verification", browser_info = ?, screen_resolution = ? WHERE id = ?',
      [browser_info, screen_resolution, req.session.examSessionId]
    );
    res.json({ success: true, redirect: '/exam/av-check' });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to save compatibility data' });
  }
});

// Phase 3: Audio & Video Verification
router.get('/exam/av-check', isStudentAuthenticated, hasActiveSession, async (req, res) => {
  try {
    const [sessions] = await db.query(
      'SELECT es.*, e.title as exam_title FROM ent_sessions es JOIN ent_exams e ON es.exam_id = e.id WHERE es.id = ?',
      [req.session.examSessionId]
    );
    if (sessions.length === 0) return res.redirect('/dashboard');
    res.render('exam/av-check', {
      session: sessions[0],
      studentName: req.session.studentName
    });
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard');
  }
});

// Phase 3: Save photo
router.post('/exam/save-photo', isStudentAuthenticated, hasActiveSession, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, error: 'No photo uploaded' });
    }
    const photoUrl = `/uploads/photos/${req.file.filename}`;
    await db.query(
      'UPDATE ent_sessions SET base_photo_url = ?, status = "rules" WHERE id = ?',
      [photoUrl, req.session.examSessionId]
    );
    res.json({ success: true, redirect: '/exam/rules' });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to save photo' });
  }
});

// Phase 4: Exam Rules & Declaration
router.get('/exam/rules', isStudentAuthenticated, hasActiveSession, async (req, res) => {
  try {
    const [sessions] = await db.query(
      'SELECT es.*, e.title as exam_title, e.duration_minutes, e.total_questions FROM ent_sessions es JOIN ent_exams e ON es.exam_id = e.id WHERE es.id = ?',
      [req.session.examSessionId]
    );
    if (sessions.length === 0) return res.redirect('/dashboard');
    res.render('exam/rules', {
      session: sessions[0],
      studentName: req.session.studentName
    });
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard');
  }
});

// Phase 4 -> Phase 5: Accept rules and start exam
router.post('/exam/accept-rules', isStudentAuthenticated, hasActiveSession, async (req, res) => {
  try {
    const [sessions] = await db.query(
      'SELECT es.*, e.duration_minutes FROM ent_sessions es JOIN ent_exams e ON es.exam_id = e.id WHERE es.id = ?',
      [req.session.examSessionId]
    );
    if (sessions.length === 0) return res.json({ success: false });

    const durationSeconds = sessions[0].duration_minutes * 60;
    await db.query(
      'UPDATE ent_sessions SET status = "in_progress", started_at = NOW(), time_remaining_seconds = ? WHERE id = ?',
      [durationSeconds, req.session.examSessionId]
    );
    res.json({ success: true, redirect: '/exam/live' });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Failed to start exam' });
  }
});

// Phase 5: Live Exam
router.get('/exam/live', isStudentAuthenticated, hasActiveSession, async (req, res) => {
  try {
    const [sessions] = await db.query(
      `SELECT es.*, e.title as exam_title, e.duration_minutes, e.total_questions,
              e.max_tab_switches, e.max_violations, e.auto_save_interval
       FROM ent_sessions es JOIN ent_exams e ON es.exam_id = e.id WHERE es.id = ?`,
      [req.session.examSessionId]
    );
    if (sessions.length === 0) return res.redirect('/dashboard');

    const session = sessions[0];
    if (session.status === 'submitted' || session.status === 'auto_submitted') {
      return res.redirect('/exam/result');
    }

    // Get questions with sections
    const [questions] = await db.query(
      `SELECT q.*, s.title as section_title FROM ent_questions q
       LEFT JOIN ent_sections s ON q.section_id = s.id
       WHERE q.exam_id = ? ORDER BY q.sort_order`,
      [session.exam_id]
    );

    // Get existing responses
    const [responses] = await db.query(
      'SELECT * FROM ent_responses WHERE session_id = ?',
      [req.session.examSessionId]
    );

    // Get violation counts
    const [violations] = await db.query(
      `SELECT type, COUNT(*) as count FROM ent_violations
       WHERE session_id = ? GROUP BY type`,
      [req.session.examSessionId]
    );

    // Calculate remaining time
    let remainingSeconds = session.time_remaining_seconds;
    if (session.started_at) {
      const elapsed = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);
      remainingSeconds = Math.max(0, (session.duration_minutes * 60) - elapsed);
    }

    const violationMap = {};
    violations.forEach(v => { violationMap[v.type] = v.count; });

    res.render('exam/live', {
      session,
      questions,
      responses,
      violationMap,
      remainingSeconds,
      studentName: req.session.studentName
    });
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard');
  }
});

// API: Save answer
router.post('/api/save-answer', isStudentAuthenticated, hasActiveSession, async (req, res) => {
  try {
    const { question_id, selected_option, marked_for_review } = req.body;
    await db.query(
      `INSERT INTO ent_responses (session_id, question_id, selected_option, marked_for_review)
       VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE selected_option = VALUES(selected_option),
       marked_for_review = VALUES(marked_for_review), answered_at = NOW()`,
      [req.session.examSessionId, question_id, selected_option || null, marked_for_review ? 1 : 0]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

// API: Log violation
router.post('/api/log-violation', isStudentAuthenticated, hasActiveSession, async (req, res) => {
  try {
    const { type, details, severity } = req.body;
    await db.query(
      'INSERT INTO ent_violations (session_id, type, details, severity) VALUES (?, ?, ?, ?)',
      [req.session.examSessionId, type, details || null, severity || 'medium']
    );

    // Check total violations
    const [counts] = await db.query(
      'SELECT COUNT(*) as total FROM ent_violations WHERE session_id = ?',
      [req.session.examSessionId]
    );

    const [sessions] = await db.query(
      'SELECT e.max_violations FROM ent_sessions es JOIN ent_exams e ON es.exam_id = e.id WHERE es.id = ?',
      [req.session.examSessionId]
    );

    const maxViolations = sessions[0]?.max_violations || 10;
    const shouldAutoSubmit = counts[0].total >= maxViolations;

    res.json({ success: true, totalViolations: counts[0].total, shouldAutoSubmit });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

// API: Log proctoring event
router.post('/api/log-event', isStudentAuthenticated, hasActiveSession, async (req, res) => {
  try {
    const { event_type, event_data } = req.body;
    await db.query(
      'INSERT INTO ent_proctoring_logs (session_id, event_type, event_data) VALUES (?, ?, ?)',
      [req.session.examSessionId, event_type, JSON.stringify(event_data || {})]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

// API: Auto-save time remaining
router.post('/api/save-time', isStudentAuthenticated, hasActiveSession, async (req, res) => {
  try {
    const { time_remaining } = req.body;
    await db.query(
      'UPDATE ent_sessions SET time_remaining_seconds = ? WHERE id = ?',
      [time_remaining, req.session.examSessionId]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// Phase 6: Submit exam
router.post('/exam/submit', isStudentAuthenticated, hasActiveSession, async (req, res) => {
  try {
    const { auto } = req.body;
    const status = auto ? 'auto_submitted' : 'submitted';

    await db.query(
      'UPDATE ent_sessions SET status = ?, submitted_at = NOW() WHERE id = ?',
      [status, req.session.examSessionId]
    );

    // Calculate results
    const [responses] = await db.query(
      `SELECT r.*, q.correct_option, q.marks FROM ent_responses r
       JOIN ent_questions q ON r.question_id = q.id WHERE r.session_id = ?`,
      [req.session.examSessionId]
    );

    const totalAnswered = responses.filter(r => r.selected_option).length;
    const correctAnswers = responses.filter(r => r.selected_option === r.correct_option).length;
    const score = responses.reduce((sum, r) => sum + (r.selected_option === r.correct_option ? r.marks : 0), 0);

    // Calculate risk score based on violations
    const [violations] = await db.query(
      'SELECT COUNT(*) as total FROM ent_violations WHERE session_id = ?',
      [req.session.examSessionId]
    );
    const riskScore = Math.min(100, (violations[0].total / 10) * 100);
    const confidenceScore = Math.max(0, 100 - riskScore);

    await db.query(
      `INSERT INTO ent_results (session_id, total_answered, correct_answers, score, risk_score, confidence_score)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.session.examSessionId, totalAnswered, correctAnswers, score, riskScore, confidenceScore]
    );

    const sessionId = req.session.examSessionId;
    delete req.session.examSessionId;

    res.json({ success: true, redirect: `/exam/result/${sessionId}` });
  } catch (err) {
    console.error('Submit error:', err);
    res.json({ success: false, error: 'Submission failed' });
  }
});

// Phase 7: Result page
router.get('/exam/result/:sessionId', isStudentAuthenticated, async (req, res) => {
  try {
    const [sessions] = await db.query(
      `SELECT es.*, e.title as exam_title, e.total_questions, er.*
       FROM ent_sessions es
       JOIN ent_exams e ON es.exam_id = e.id
       LEFT JOIN ent_results er ON er.session_id = es.id
       WHERE es.id = ? AND es.student_id = ?`,
      [req.params.sessionId, req.session.studentId]
    );
    if (sessions.length === 0) return res.redirect('/dashboard');

    res.render('exam/result', {
      session: sessions[0],
      studentName: req.session.studentName
    });
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard');
  }
});

module.exports = router;
