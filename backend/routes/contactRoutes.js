/**
 * Contact API routes.
 * POST /api/contact/request-callback – sends email to info@proconix.uk (or CALLBACK_NOTIFY_EMAIL).
 */

const express = require('express');
const { sendCallbackRequestEmail } = require('../lib/sendCallbackRequestEmail');

const router = express.Router();

/** POST /api/contact/request-callback */
router.post('/request-callback', async function (req, res) {
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

    try {
      await sendCallbackRequestEmail({ fullName, email, phone });
    } catch (mailErr) {
      if (mailErr && mailErr.code === 'SMTP_NOT_CONFIGURED') {
        console.error('request-callback: SMTP not configured. Set SMTP_HOST (and typically SMTP_USER, SMTP_PASS) in .env');
        return res.status(503).json({
          success: false,
          message: 'Email is not configured on the server. Please try again later or contact support directly.',
        });
      }
      throw mailErr;
    }

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
