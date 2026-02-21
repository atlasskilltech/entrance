const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');

// Student login page
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Student login POST
router.post('/login', async (req, res) => {
  try {
    const { application_id, password, mobile } = req.body;

    let query, params;
    if (application_id && password) {
      query = 'SELECT * FROM students WHERE application_id = ?';
      params = [application_id];
    } else if (mobile) {
      query = 'SELECT * FROM students WHERE mobile = ?';
      params = [mobile];
    } else {
      return res.render('login', { error: 'Please provide valid credentials' });
    }

    const [rows] = await db.query(query, params);
    if (rows.length === 0) {
      return res.render('login', { error: 'Invalid credentials' });
    }

    const student = rows[0];

    if (password) {
      const isMatch = await bcrypt.compare(password, student.password);
      if (!isMatch) {
        return res.render('login', { error: 'Invalid password' });
      }
    }

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
    const { username, password } = req.body;
    const [rows] = await db.query('SELECT * FROM admins WHERE username = ?', [username]);

    if (rows.length === 0) {
      return res.render('admin/login', { error: 'Invalid credentials' });
    }

    const admin = rows[0];
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.render('admin/login', { error: 'Invalid password' });
    }

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
