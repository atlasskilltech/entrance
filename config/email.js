const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter using SMTP config from environment
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Entrance Exam Portal';
const FROM_EMAIL = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@example.com';

/**
 * Send exam invitation email with auto-login link
 */
async function sendExamInvitation(student, exam, token) {
  const loginUrl = `${APP_URL}/auth/token/${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Exam Invitation</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">You have been assigned an examination</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#374151;margin:0 0 16px;">Hello <strong>${student.name}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 20px;">
        You have been assigned to take the following exam. Please click the button below to proceed directly to your exam.
      </p>

      <!-- Exam Details Card -->
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 24px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:4px 0;color:#6b7280;">Exam</td>
            <td style="padding:4px 0;color:#111827;font-weight:600;text-align:right;">${exam.title}</td>
          </tr>
          ${exam.exam_code ? `<tr><td style="padding:4px 0;color:#6b7280;">Code</td><td style="padding:4px 0;color:#111827;text-align:right;font-family:monospace;">${exam.exam_code}</td></tr>` : ''}
          <tr>
            <td style="padding:4px 0;color:#6b7280;">Duration</td>
            <td style="padding:4px 0;color:#111827;text-align:right;">${exam.duration_minutes} minutes</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280;">Total Marks</td>
            <td style="padding:4px 0;color:#111827;text-align:right;">${exam.total_marks}</td>
          </tr>
          ${exam.exam_date ? `<tr><td style="padding:4px 0;color:#6b7280;">Date</td><td style="padding:4px 0;color:#111827;text-align:right;">${new Date(exam.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>` : ''}
          ${exam.start_time ? `<tr><td style="padding:4px 0;color:#6b7280;">Time</td><td style="padding:4px 0;color:#111827;text-align:right;">${exam.start_time}${exam.end_time ? ' - ' + exam.end_time : ''}</td></tr>` : ''}
          <tr>
            <td style="padding:4px 0;color:#6b7280;">Application ID</td>
            <td style="padding:4px 0;color:#111827;text-align:right;font-family:monospace;">${student.application_id}</td>
          </tr>
        </table>
      </div>

      <!-- CTA Button -->
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${loginUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.3px;">
          Start Exam Now
        </a>
      </div>

      <p style="font-size:12px;color:#9ca3af;line-height:1.5;margin:0 0 12px;">
        This link is unique to you and will expire in 72 hours. Do not share it with anyone.
      </p>

      <p style="font-size:12px;color:#9ca3af;line-height:1.5;margin:0;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${loginUrl}" style="color:#4f46e5;word-break:break-all;">${loginUrl}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 24px;text-align:center;">
      <p style="font-size:11px;color:#9ca3af;margin:0;">${FROM_NAME} &bull; This is an automated message</p>
    </div>
  </div>
</body>
</html>`;

  const mailOptions = {
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: student.email,
    subject: `Exam Invitation: ${exam.title}`,
    html
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { transporter, sendExamInvitation };
