const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Student login page
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Student login POST
router.post('/login', async (req, res) => {
  try {
    const application_id = (req.body.application_id || '').trim();

    if (!application_id) {
      return res.render('login', { error: 'Please provide Application ID' });
    }

    const [rows] = await db.query('SELECT * FROM ent_students WHERE application_id = ?', [application_id]);
    if (rows.length === 0) {
      return res.render('login', { error: 'Invalid Application ID' });
    }

    const student = rows[0];

    req.session.studentId = student.id;
    req.session.studentName = student.name;
    req.session.applicationId = student.application_id;
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { error: 'An error occurred. Please try again.' });
  }
});

// Student logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Admin login page
router.get('/admin/login', (req, res) => {
  res.render('admin/login', { error: null });
});

// Admin login POST
router.post('/admin/login', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();

    if (!username) {
      return res.render('admin/login', { error: 'Please provide username' });
    }

    const [rows] = await db.query('SELECT * FROM ent_admins WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.render('admin/login', { error: 'Invalid username' });
    }

    const admin = rows[0];

    req.session.adminId = admin.id;
    req.session.adminName = admin.name;
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Admin login error:', err);
    res.render('admin/login', { error: 'An error occurred' });
  }
});

// Admin logout
router.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

module.exports = router;
