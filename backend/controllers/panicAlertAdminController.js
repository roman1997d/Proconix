/**
 * Platform admin: panic alert configuration + manual/test triggers.
 */

const {
  getPanicAlertConfig,
  runPanicAlertCheck,
  collectIssues,
} = require('../lib/panicAlertService');

async function getPanicAlert(req, res) {
  try {
    const cfg = getPanicAlertConfig();
    let preview = null;
    try {
      preview = await collectIssues();
    } catch (e) {
      preview = { error: e && e.message ? String(e.message) : String(e) };
    }
    return res.json({
      success: true,
      config: cfg,
      preview,
    });
  } catch (error) {
    console.error('panicAlert getPanicAlert:', error);
    return res.status(500).json({ success: false, message: 'Failed to load panic alert settings.' });
  }
}

async function postPanicAlertTest(req, res) {
  try {
    const out = await runPanicAlertCheck({ test: true });
    return res.json({
      success: true,
      ...out,
      message: out.test ? 'Test email sent.' : 'Completed.',
    });
  } catch (error) {
    if (error && error.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({
        success: false,
        message: 'SMTP not configured (set SMTP_HOST etc.).',
      });
    }
    if (error && error.code === 'NO_RECIPIENTS') {
      return res.status(400).json({
        success: false,
        message: 'No recipient emails configured.',
      });
    }
    console.error('panicAlert postPanicAlertTest:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send test email.',
    });
  }
}

async function postPanicAlertRun(req, res) {
  const force = !!(req.body && (req.body.force === true || req.body.force === 'true'));
  try {
    const out = await runPanicAlertCheck({ force });
    return res.json({
      success: true,
      ...out,
      message:
        out.alerted === true
          ? `Alert email sent (${(out.sent_keys || []).join(', ')}).`
          : out.suppressed_by_cooldown
          ? 'Issues present but within cooldown (use force to bypass).'
          : out.issue_count
          ? 'Checks completed; no alert needed.'
          : 'Checks OK.',
    });
  } catch (error) {
    if (error && error.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({
        success: false,
        message: 'SMTP not configured (set SMTP_HOST etc.).',
      });
    }
    console.error('panicAlert postPanicAlertRun:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Run failed.',
    });
  }
}

module.exports = {
  getPanicAlert,
  postPanicAlertTest,
  postPanicAlertRun,
};
