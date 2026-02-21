function isStudentAuthenticated(req, res, next) {
  if (req.session && req.session.studentId) {
    return next();
  }
  res.redirect('/login');
}

function isAdminAuthenticated(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  res.redirect('/admin/login');
}

function hasActiveSession(req, res, next) {
  if (req.session && req.session.examSessionId) {
    return next();
  }
  res.redirect('/dashboard');
}

module.exports = { isStudentAuthenticated, isAdminAuthenticated, hasActiveSession };
