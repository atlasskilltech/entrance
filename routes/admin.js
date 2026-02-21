const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAdminAuthenticated } = require('../middleware/auth');

// Admin Dashboard
router.get('/admin/dashboard', isAdminAuthenticated, async (req, res) => {
  try {
    const [stats] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM students) as total_students,
        (SELECT COUNT(*) FROM exam_sessions) as total_sessions,
        (SELECT COUNT(*) FROM exam_sessions WHERE status = 'in_progress') as active_sessions,
        (SELECT COUNT(*) FROM exam_sessions WHERE status IN ('submitted', 'auto_submitted')) as completed_sessions,
        (SELECT COUNT(*) FROM exam_results WHERE admin_status = 'flagged') as flagged_sessions
    `);

    const [recentSessions] = await db.query(`
      SELECT es.*, s.name as student_name, s.application_id, e.title as exam_title,
             er.score, er.risk_score, er.confidence_score, er.admin_status,
             (SELECT COUNT(*) FROM violations v WHERE v.session_id = es.id) as violation_count
      FROM exam_sessions es
      JOIN students s ON es.student_id = s.id
      JOIN exams e ON es.exam_id = e.id
      LEFT JOIN exam_results er ON er.session_id = es.id
      ORDER BY es.created_at DESC LIMIT 50
    `);

    res.render('admin/dashboard', {
      adminName: req.session.adminName,
      stats: stats[0],
      sessions: recentSessions
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.redirect('/admin/login');
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
      FROM exam_sessions es
      JOIN students s ON es.student_id = s.id
      JOIN exams e ON es.exam_id = e.id
      LEFT JOIN exam_results er ON er.session_id = es.id
      WHERE es.id = ?
    `, [req.params.id]);

    if (sessions.length === 0) return res.redirect('/admin/dashboard');

    const [violations] = await db.query(
      'SELECT * FROM violations WHERE session_id = ? ORDER BY timestamp',
      [req.params.id]
    );

    const [violationSummary] = await db.query(
      'SELECT type, COUNT(*) as count FROM violations WHERE session_id = ? GROUP BY type',
      [req.params.id]
    );

    const [responses] = await db.query(`
      SELECT r.*, q.question_text, q.correct_option, q.marks,
             s.title as section_title
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      LEFT JOIN sections s ON q.section_id = s.id
      WHERE r.session_id = ?
      ORDER BY q.sort_order
    `, [req.params.id]);

    const [logs] = await db.query(
      'SELECT * FROM proctoring_logs WHERE session_id = ? ORDER BY created_at',
      [req.params.id]
    );

    res.render('admin/session-detail', {
      adminName: req.session.adminName,
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

// Update session status (approve / flag / disqualify)
router.post('/admin/session/:id/update', isAdminAuthenticated, async (req, res) => {
  try {
    const { admin_status, admin_notes } = req.body;
    await db.query(
      `UPDATE exam_results SET admin_status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE session_id = ?`,
      [admin_status, admin_notes, req.session.adminId, req.params.id]
    );

    if (admin_status === 'disqualified') {
      await db.query(
        'UPDATE exam_sessions SET status = "disqualified" WHERE id = ?',
        [req.params.id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

// Manage exams
router.get('/admin/exams', isAdminAuthenticated, async (req, res) => {
  try {
    const [exams] = await db.query('SELECT * FROM exams ORDER BY created_at DESC');
    res.render('admin/exams', { adminName: req.session.adminName, exams });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});

// Manage students
router.get('/admin/students', isAdminAuthenticated, async (req, res) => {
  try {
    const [students] = await db.query('SELECT * FROM students ORDER BY created_at DESC');
    res.render('admin/students', { adminName: req.session.adminName, students });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});

module.exports = router;
