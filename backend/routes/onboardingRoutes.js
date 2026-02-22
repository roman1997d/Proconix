/**
 * Onboarding: get company_id from signed token (for register_manager step).
 * GET /api/onboarding/company?token=xxx
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../utils/onboardingToken');

router.get('/company', function (req, res) {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired onboarding token. Please register your company again.',
    });
  }
  return res.status(200).json({
    success: true,
    company_id: payload.company_id,
  });
});

module.exports = router;
