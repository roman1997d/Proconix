/**
 * Contact API routes (placeholder).
 * POST /api/contact/request-callback – request a callback (e.g. store in DB or send email later).
 */

const express = require('express');
const router = express.Router();

/** POST /api/contact/request-callback – placeholder; replace with real logic (DB, email). */
router.post('/request-callback', function (req, res) {
  try {
    const body = req.body || {};
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

    if (!fullName || fullName.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Full name is required (at least 2 characters).',
      });
    }
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required.',
      });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.',
      });
    }
    if (!phone || phone.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required (at least 6 characters).',
      });
    }

    // Placeholder: log or save to DB / send email when implemented
    console.log('Callback requested:', { fullName, email, phone });

    return res.status(200).json({
      success: true,
      message: 'Thank you! We will contact you shortly.',
    });
  } catch (err) {
    console.error('request-callback error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit request.',
      error: err.message,
    });
  }
});

module.exports = router;
