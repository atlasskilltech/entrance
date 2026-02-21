const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exam');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'entrance-exam-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 4 * 60 * 60 * 1000 // 4 hours
  }
}));

// Routes
app.use('/', authRoutes);
app.use('/', examRoutes);
app.use('/', adminRoutes);

// Home redirect
app.get('/', (req, res) => {
  if (req.session.studentId) return res.redirect('/dashboard');
  res.redirect('/login');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
