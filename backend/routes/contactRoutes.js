/**
 * Contact API routes.
 * POST /api/contact/request-callback – sends email to CALLBACK_NOTIFY_EMAIL.
 * POST /api/contact/book-demo – Book Demo modal on index.html → info@proconix.uk (override: BOOK_DEMO_NOTIFY_EMAIL).
 */

const express = require('express');
const {
  sendCallbackRequestEmail,
  sendContactUsEmail,
  sendBookDemoEmail,
} = require('../lib/sendCallbackRequestEmail');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (!EMAIL_RE.test(email)) {
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

/** POST /api/contact/message — ContactUs.html form */
router.post('/message', async function (req, res) {
  try {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const company = typeof body.company === 'string' ? body.company.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const role = typeof body.role === 'string' ? body.role.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!name || name.length < 2) {
      return res.status(400).json({ success: false, message: 'Full name is required (at least 2 characters).' });
    }
    if (!company || company.length < 2) {
      return res.status(400).json({ success: false, message: 'Company name is required.' });
    }
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    if (!phone || phone.length < 6) {
      return res.status(400).json({ success: false, message: 'Phone number is required (at least 6 characters).' });
    }
    if (!message || message.length < 10) {
      return res.status(400).json({ success: false, message: 'Please enter a message (at least 10 characters).' });
    }

    try {
      await sendContactUsEmail({ name, company, email, phone, role, message });
    } catch (mailErr) {
      if (mailErr && mailErr.code === 'SMTP_NOT_CONFIGURED') {
        console.error('contact/message: SMTP not configured.');
        return res.status(503).json({
          success: false,
          message: 'Email is not configured on the server. Please try again later or email us directly.',
        });
      }
      throw mailErr;
    }

    return res.status(200).json({
      success: true,
      message: 'Thank you for your message. We will get back to you shortly.',
    });
  } catch (err) {
    console.error('contact/message error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to send message.',
      error: err.message,
    });
  }
});

/** POST /api/contact/book-demo — index.html Book Demo modal */
router.post('/book-demo', async function (req, res) {
  try {
    const body = req.body || {};
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const role = typeof body.role === 'string' ? body.role.trim() : '';

    if (!firstName || firstName.length < 1) {
      return res.status(400).json({ success: false, message: 'First name is required.' });
    }
    if (!lastName || lastName.length < 1) {
      return res.status(400).json({ success: false, message: 'Last name is required.' });
    }
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    try {
      await sendBookDemoEmail({ firstName, lastName, email, role });
    } catch (mailErr) {
      if (mailErr && mailErr.code === 'SMTP_NOT_CONFIGURED') {
        console.error('book-demo: SMTP not configured.');
        return res.status(503).json({
          success: false,
          message: 'Email is not configured on the server. Please email info@proconix.uk directly.',
        });
      }
      throw mailErr;
    }

    return res.status(200).json({
      success: true,
      message: 'Thank you! We will be in touch to schedule your demo.',
    });
  } catch (err) {
    console.error('book-demo error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit request.',
      error: err.message,
    });
  }
});

module.exports = router;
