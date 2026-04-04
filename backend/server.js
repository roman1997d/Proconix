/**
 * Express server: serves frontend static files and API routes.
 * - Static: ../frontend
 * - API: /api/companies/*, /api/health, /api/site-snags/*, …
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('./lib/serverProcessLogBuffer').install();
const express = require('express');
const path = require('path');
const { testConnection } = require('./db/pool');
const companyRoutes = require('./routes/companyRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const contactRoutes = require('./routes/contactRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');
const managerRoutes = require('./routes/managerRoutes');
const authRoutes = require('./routes/authRoutes');
const operativeRoutes = require('./routes/operativeRoutes');
const projectsRoutes = require('./routes/projectsRoutes');
const worklogsRoutes = require('./routes/worklogsRoutes');
const qaRoutes = require('./routes/qaRoutes');
const materialsRoutes = require('./routes/materialsRoutes');
const planningRoutes = require('./routes/planningRoutes');
const platformAdminRoutes = require('./routes/platformAdminRoutes');
const siteSnagsRoutes = require('./routes/siteSnagsRoutes');
const digitalDocumentsRoutes = require('./routes/digitalDocumentsRoutes');
const { metricsMiddleware } = require('./middleware/metricsMiddleware');
const { printStartupConsoleBanner } = require('./lib/startupConsoleBanner');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || 'localhost';
const frontendDir = path.resolve(__dirname, '../frontend');

// Middleware
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '25mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(metricsMiddleware);

// Health check (database connectivity)
app.get('/api/health', async (req, res) => {
  try {
    const result = await testConnection();
    if (result.ok) {
      return res.status(200).json({
        status: 'ok',
        connected: true,
        database: result.message,
        message: 'Database is connected.',
      });
    }
    return res.status(503).json({
      status: 'error',
      connected: false,
      database: result.error,
      message: 'Database is not connected.',
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      connected: false,
      error: err.message,
    });
  }
});

// Company API
app.use('/api/companies', companyRoutes);

// Subscription plan placeholders (See Plans page)
app.use('/api/subscriptions', subscriptionRoutes);

// Contact (callback request)
app.use('/api/contact', contactRoutes);

// Dashboard modules (HTML partials for dynamic content)
app.use('/api/dashboard', dashboardRoutes);

// Onboarding (token -> company_id for register_manager)
app.use('/api/onboarding', onboardingRoutes);

// Managers (register manager after company)
app.use('/api/managers', managerRoutes);

// Auth (validate manager session for dashboard)
app.use('/api/auth', authRoutes);

// Operatives (add operative/supervisor for manager's company + operative dashboard)
app.use('/api/operatives', operativeRoutes);

// Projects (manager's company projects – CRUD, assign operatives)
app.use('/api/projects', projectsRoutes);

// Work Logs (manager: list, edit, approve, reject, archive)
app.use('/api/worklogs', worklogsRoutes);

// Quality Assurance (templates, jobs) – GET/POST/PUT/DELETE /api/templates, /api/jobs
app.use('/api', qaRoutes);

// Material Management – GET/POST/PUT/DELETE under /api/materials
app.use('/api/materials', materialsRoutes);

// Planning (Task & Planning module)
app.use('/api/planning', planningRoutes);

// Platform administrators (Proconix operator console)
app.use('/api/platform-admin', platformAdminRoutes);

// Site Snags (per-company JSON state; requires site_snags_state table)
app.use('/api/site-snags', siteSnagsRoutes);

// Documents & digital signatures (PDF storage under backend/uploads/{Name}_{companyId}_docs/)
app.use('/api/documents', digitalDocumentsRoutes);

// API 404 – ensure all unmatched /api/* return JSON (no HTML)
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API endpoint not found.', path: req.path });
});

// Uploaded files (issues, documents) – served from backend/uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Clean URLs for About (SEO-friendly /about and /about-us)
const aboutHtmlPath = path.join(frontendDir, 'about.html');
app.get(['/about', '/about-us'], (req, res) => {
  res.sendFile(aboutHtmlPath);
});

// Static frontend (index.html, favicon.ico, register_company.html, css/, js/, etc.)
app.use(express.static(frontendDir));

// Global error handler – return JSON for /api so frontend never gets HTML
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const isApi = req.path && req.path.startsWith('/api');
  const message = err.message || 'Server error.';
  if (isApi) {
    return res.status(500).json({ message });
  }
  res.status(500).send(message);
});

// Start server
app.listen(PORT, HOST, async () => {
  const dbStatus = await testConnection();
  const dbName = process.env.PGDATABASE || process.env.DB_NAME || 'ProconixDB';

  printStartupConsoleBanner({
    dbOk: dbStatus.ok,
    dbName,
    dbError: dbStatus.error || null,
  });
});
