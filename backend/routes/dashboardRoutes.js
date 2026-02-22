/**
 * Dashboard module content – GET /api/dashboard/:module
 * Returns HTML partials for dynamic content loading (no page refresh).
 * All routes require valid active manager (requireManagerAuth).
 */

const express = require('express');
const router = express.Router();
const { requireManagerAuth } = require('../middleware/requireManagerAuth');

const modules = {
  'project-overview': getProjectOverviewHtml,
  'projects': getProjectsHtml,
  'project-builder': getProjectBuilderHtml,
  'task-management': getTaskManagementHtml,
  'material-management': getMaterialManagementHtml,
  'risk-management': getRiskManagementHtml,
  'operatives': getOperativesHtml,
  'worklogs': getWorkLogsHtml,
  'plants': getPlantsHtml,
  'accounting': getAccountingHtml,
  'resources-files': getResourcesFilesHtml,
  'reports': getReportsHtml,
  'complains': getComplainsHtml,
  'issues': getIssuesHtml,
};

function getProjectOverviewHtml() {
  return `
    <section class="stat-cards">
      <div class="stat-card stat-card-patients">
        <div class="stat-card-content">
          <span class="stat-label">Total Projects</span>
          <span class="stat-value">24</span>
          <span class="stat-badge">+12%</span>
        </div>
      </div>
      <div class="stat-card stat-card-appointments">
        <div class="stat-card-content">
          <span class="stat-label">Active Tasks</span>
          <span class="stat-value">156</span>
          <span class="stat-badge">+8%</span>
        </div>
      </div>
      <div class="stat-card stat-card-surgery">
        <div class="stat-card-content">
          <span class="stat-label">Operatives</span>
          <span class="stat-value" id="project-overview-operatives-count">—</span>
          <span class="stat-badge stat-badge-operatives d-none" id="project-overview-operatives-badge">+5%</span>
        </div>
      </div>
      <div class="stat-card stat-card-revenue">
        <div class="stat-card-content">
          <span class="stat-label">Total Revenue</span>
          <span class="stat-value">£48.2K</span>
          <span class="stat-badge">+18%</span>
        </div>
      </div>
    </section>
    <section class="dashboard-grid">
      <div class="dashboard-card chart-card">
        <h2 class="card-title">Activity Overview</h2>
        <div class="chart-wrap"><canvas id="lineChart" height="200"></canvas></div>
      </div>
      <div class="dashboard-card chart-card">
        <h2 class="card-title">Revenue Distribution</h2>
        <div class="chart-wrap chart-wrap-pie"><canvas id="pieChart" height="200"></canvas></div>
      </div>
    </section>
    <section class="dashboard-grid">
      <div class="dashboard-card table-card">
        <h2 class="card-title">Recent Activity</h2>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Project</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              <tr><td>Site Alpha</td><td><span class="status-badge status-green">Active</span></td><td>12 Feb 2026</td></tr>
              <tr><td>Site Beta</td><td><span class="status-badge status-yellow">Pending</span></td><td>11 Feb 2026</td></tr>
              <tr><td>Site Gamma</td><td><span class="status-badge status-red">Overdue</span></td><td>10 Feb 2026</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function getPlaceholderHtml(title, icon, description) {
  return `
    <div class="module-placeholder">
      <i class="bi ${icon} module-placeholder-icon"></i>
      <h2 class="card-title">${title}</h2>
      <p class="module-placeholder-desc">${description}</p>
      <p class="text-muted small">This module can be extended with tables, forms, or charts.</p>
    </div>
  `;
}

function getProjectsHtml() {
  return `
    <section class="projects-module dashboard-card">
      <div class="projects-header">
        <h2 class="card-title">My Projects</h2>
        <button type="button" class="btn-projects-add" id="projects-btn-add" aria-label="Add Project">
          <i class="bi bi-plus-lg"></i> Add Project
        </button>
      </div>
      <div id="projects-access-denied" class="projects-access-denied d-none">
        <p>Access Denied. You are not authorized to view this project.</p>
      </div>
      <div id="projects-list-wrap">
        <div id="projects-loading" class="projects-loading">Loading projects…</div>
        <div id="projects-list" class="projects-list"></div>
        <div id="projects-empty" class="projects-empty d-none">No projects yet. Click "Add Project" to create one.</div>
      </div>
      <div id="projects-toast" class="projects-toast d-none" role="status"></div>
    </section>

    <!-- Add Project Modal -->
    <div id="projects-modal-add" class="projects-modal" aria-hidden="true" role="dialog">
      <div class="projects-modal-backdrop" data-dismiss="projects-modal"></div>
      <div class="projects-modal-dialog">
        <div class="projects-modal-content">
          <div class="projects-modal-header">
            <h3>Add Project</h3>
            <button type="button" class="projects-modal-close" data-dismiss="projects-modal" aria-label="Close">&times;</button>
          </div>
          <div class="projects-modal-body">
            <form id="projects-form-add">
              <div class="projects-field">
                <label for="projects-add-name">Project Name <span class="text-danger">*</span></label>
                <input type="text" id="projects-add-name" required placeholder="Project name">
              </div>
              <div class="projects-field">
                <label for="projects-add-address">Address</label>
                <input type="text" id="projects-add-address" placeholder="Address">
              </div>
              <div class="projects-field">
                <label for="projects-add-description">Description</label>
                <textarea id="projects-add-description" rows="3" placeholder="Description"></textarea>
              </div>
              <div class="projects-field-row">
                <div class="projects-field">
                  <label for="projects-add-start">Start Date</label>
                  <input type="date" id="projects-add-start">
                </div>
                <div class="projects-field">
                  <label for="projects-add-planned-end">Planned End Date</label>
                  <input type="date" id="projects-add-planned-end">
                </div>
              </div>
              <div class="projects-field">
                <label for="projects-add-floors">Number of Floors</label>
                <input type="number" id="projects-add-floors" min="0" placeholder="e.g. 3">
              </div>
              <button type="submit" class="btn-projects-primary">Save</button>
            </form>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Project Modal -->
    <div id="projects-modal-edit" class="projects-modal" aria-hidden="true" role="dialog">
      <div class="projects-modal-backdrop" data-dismiss="projects-modal"></div>
      <div class="projects-modal-dialog">
        <div class="projects-modal-content">
          <div class="projects-modal-header">
            <h3>Edit Project</h3>
            <button type="button" class="projects-modal-close" data-dismiss="projects-modal" aria-label="Close">&times;</button>
          </div>
          <div class="projects-modal-body">
            <form id="projects-form-edit">
              <input type="hidden" id="projects-edit-id">
              <div class="projects-field">
                <label for="projects-edit-name">Project Name <span class="text-danger">*</span></label>
                <input type="text" id="projects-edit-name" required placeholder="Project name">
              </div>
              <div class="projects-field">
                <label for="projects-edit-address">Address</label>
                <input type="text" id="projects-edit-address" placeholder="Address">
              </div>
              <div class="projects-field">
                <label for="projects-edit-description">Description</label>
                <textarea id="projects-edit-description" rows="3" placeholder="Description"></textarea>
              </div>
              <div class="projects-field-row">
                <div class="projects-field">
                  <label for="projects-edit-start">Start Date</label>
                  <input type="date" id="projects-edit-start">
                </div>
                <div class="projects-field">
                  <label for="projects-edit-planned-end">Planned End Date</label>
                  <input type="date" id="projects-edit-planned-end">
                </div>
              </div>
              <div class="projects-field">
                <label for="projects-edit-floors">Number of Floors</label>
                <input type="number" id="projects-edit-floors" min="0" placeholder="e.g. 3">
              </div>
              <button type="submit" class="btn-projects-primary">Save Changes</button>
            </form>
          </div>
        </div>
      </div>
    </div>

    <!-- View Details Modal -->
    <div id="projects-modal-details" class="projects-modal" aria-hidden="true" role="dialog">
      <div class="projects-modal-backdrop" data-dismiss="projects-modal"></div>
      <div class="projects-modal-dialog">
        <div class="projects-modal-content">
          <div class="projects-modal-header">
            <h3>Project Details</h3>
            <button type="button" class="projects-modal-close" data-dismiss="projects-modal" aria-label="Close">&times;</button>
          </div>
          <div class="projects-modal-body">
            <div id="projects-details-content"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm Deactivate Modal -->
    <div id="projects-modal-deactivate" class="projects-modal" aria-hidden="true" role="dialog">
      <div class="projects-modal-backdrop" data-dismiss="projects-modal"></div>
      <div class="projects-modal-dialog">
        <div class="projects-modal-content">
          <div class="projects-modal-header">
            <h3>Deactivate Project</h3>
            <button type="button" class="projects-modal-close" data-dismiss="projects-modal" aria-label="Close">&times;</button>
          </div>
          <div class="projects-modal-body">
            <p id="projects-deactivate-message">Are you sure you want to deactivate this project?</p>
            <input type="hidden" id="projects-deactivate-id">
            <div class="projects-modal-actions">
              <button type="button" class="btn-projects-secondary" data-dismiss="projects-modal">Cancel</button>
              <button type="button" class="btn-projects-danger" id="projects-btn-deactivate-confirm">Deactivate</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Assign Operatives/Managers Modal -->
    <div id="projects-modal-assign" class="projects-modal" aria-hidden="true" role="dialog">
      <div class="projects-modal-backdrop" data-dismiss="projects-modal"></div>
      <div class="projects-modal-dialog projects-modal-dialog-lg">
        <div class="projects-modal-content">
          <div class="projects-modal-header">
            <h3>Assign Operatives / Managers</h3>
            <button type="button" class="projects-modal-close" data-dismiss="projects-modal" aria-label="Close">&times;</button>
          </div>
          <div class="projects-modal-body">
            <input type="hidden" id="projects-assign-project-id">
            <p class="projects-assign-hint text-muted small">Only people from your company appear in the list. Select an operative to see their role, then assign.</p>
            <div class="projects-assign-form">
              <div class="projects-field">
                <label for="projects-assign-user">Operative / User (from your company)</label>
                <select id="projects-assign-user"><option value="">Select operative...</option></select>
              </div>
              <div class="projects-field">
                <span class="projects-assign-role-label">Role (from profile):</span>
                <span id="projects-assign-role-display" class="projects-assign-role-display">—</span>
              </div>
              <button type="button" class="btn-projects-primary" id="projects-btn-assign">Assign</button>
            </div>
            <div class="projects-assign-table-wrap">
              <table class="projects-table">
                <thead><tr><th>Name</th><th>Role</th><th>Assigned</th><th></th></tr></thead>
                <tbody id="projects-assign-tbody"></tbody>
              </table>
              <div id="projects-assign-empty" class="projects-assign-empty d-none">No one assigned yet.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getProjectBuilderHtml() {
  return getPlaceholderHtml('Project Builder', 'bi-diagram-3-fill', 'Create and configure new projects.');
}

function getTaskManagementHtml() {
  return getPlaceholderHtml('Task Management', 'bi-check2-square', 'Manage tasks and assignments.');
}

function getMaterialManagementHtml() {
  return getPlaceholderHtml('Material Management', 'bi-box-seam-fill', 'Track materials and inventory.');
}

function getRiskManagementHtml() {
  return getPlaceholderHtml('Risk Management', 'bi-shield-exclamation', 'Monitor and mitigate risks.');
}

function getOperativesHtml() {
  return `
    <section class="operatives-section dashboard-card">
      <div class="operatives-header">
        <h2 class="card-title">Operatives</h2>
        <div class="operatives-actions">
          <button type="button" class="btn-operatives btn-operatives-operative" data-action="add-operative" aria-label="Add Operative">
            <i class="bi bi-person-plus-fill"></i> Add Operative
          </button>
          <button type="button" class="btn-operatives btn-operatives-supervisor" data-action="add-supervisor" aria-label="Add Supervisor">
            <i class="bi bi-person-badge-fill"></i> Add Supervisor
          </button>
        </div>
      </div>
      <div id="operatives-stats" class="operatives-stats">
        <div class="operatives-stats-loading">Loading statistics…</div>
      </div>
      <div class="operatives-table-wrap">
        <div id="operatives-table-loading" class="operatives-table-loading">Loading operatives…</div>
        <table class="operatives-table d-none" id="operatives-table" aria-label="Company operatives">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Project</th>
              <th>Registered</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="operatives-tbody"></tbody>
        </table>
        <div id="operatives-empty" class="operatives-empty d-none">No operatives yet. Add one using the buttons above.</div>
      </div>
      <div id="operatives-feedback" class="operatives-feedback d-none" role="alert"></div>
    </section>

    <!-- Confirm action modal -->
    <div id="operatives-confirm-modal" class="operatives-modal" aria-hidden="true" role="dialog">
      <div class="operatives-modal-backdrop" data-dismiss="confirm-modal"></div>
      <div class="operatives-modal-dialog operatives-confirm-dialog">
        <div class="operatives-modal-content">
          <div class="operatives-modal-header">
            <h3 id="operatives-confirm-title" class="operatives-modal-title">Confirm</h3>
            <button type="button" class="operatives-modal-close" data-dismiss="confirm-modal" aria-label="Close">&times;</button>
          </div>
          <div class="operatives-modal-body">
            <p id="operatives-confirm-message" class="operatives-confirm-message"></p>
            <div class="operatives-modal-actions">
              <button type="button" class="btn-operatives-cancel" data-dismiss="confirm-modal">Cancel</button>
              <button type="button" id="operatives-confirm-btn" class="btn-operatives-submit btn-operatives-confirm-do">Confirm</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Operative Modal -->
    <div id="modal-add-operative" class="operatives-modal" aria-hidden="true" role="dialog" aria-labelledby="modal-add-operative-title">
      <div class="operatives-modal-backdrop" data-dismiss="modal"></div>
      <div class="operatives-modal-dialog">
        <div class="operatives-modal-content">
          <div class="operatives-modal-header">
            <h3 id="modal-add-operative-title" class="operatives-modal-title">Add Operative</h3>
            <button type="button" class="operatives-modal-close" data-dismiss="modal" aria-label="Close">&times;</button>
          </div>
          <div class="operatives-modal-body">
            <form id="form-add-operative" class="operatives-form" data-form-type="operative">
              <div class="mb-3">
                <label for="op-first-name" class="form-label">First Name <span class="text-danger">*</span></label>
                <input type="text" id="op-first-name" name="firstName" class="form-control operatives-input" required maxlength="255" placeholder="First name">
              </div>
              <div class="mb-3">
                <label for="op-surname" class="form-label">Last Name <span class="text-danger">*</span></label>
                <input type="text" id="op-surname" name="surname" class="form-control operatives-input" maxlength="255" placeholder="Last name">
              </div>
              <div class="mb-3">
                <label for="op-email" class="form-label">Email <span class="text-danger">*</span></label>
                <input type="email" id="op-email" name="email" class="form-control operatives-input" required placeholder="email@example.com">
                <div id="op-email-invalid" class="invalid-feedback operatives-invalid">Please enter a valid email address.</div>
              </div>
              <div class="mb-3">
                <label for="op-role" class="form-label">Role</label>
                <select id="op-role" name="role" class="form-select operatives-input">
                  <option value="Plaster">Plaster</option>
                  <option value="Dryliner">Dryliner</option>
                  <option value="Electrician">Electrician</option>
                  <option value="Plumber">Plumber</option>
                  <option value="Painter">Painter</option>
                  <option value="Carpenter">Carpenter</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div class="mb-3 form-check">
                <input type="checkbox" id="op-active" name="active" class="form-check-input operatives-input" value="1">
                <label for="op-active" class="form-check-label">Active Now?</label>
              </div>
              <div class="operatives-modal-actions">
                <button type="button" class="btn-operatives-cancel" data-dismiss="modal">Cancel</button>
                <button type="submit" class="btn-operatives-submit">Add Operative</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Supervisor Modal -->
    <div id="modal-add-supervisor" class="operatives-modal" aria-hidden="true" role="dialog" aria-labelledby="modal-add-supervisor-title">
      <div class="operatives-modal-backdrop" data-dismiss="modal"></div>
      <div class="operatives-modal-dialog">
        <div class="operatives-modal-content">
          <div class="operatives-modal-header">
            <h3 id="modal-add-supervisor-title" class="operatives-modal-title">Add Supervisor</h3>
            <button type="button" class="operatives-modal-close" data-dismiss="modal" aria-label="Close">&times;</button>
          </div>
          <div class="operatives-modal-body">
            <form id="form-add-supervisor" class="operatives-form" data-form-type="supervisor">
              <div class="mb-3">
                <label for="sup-first-name" class="form-label">First Name <span class="text-danger">*</span></label>
                <input type="text" id="sup-first-name" name="firstName" class="form-control operatives-input" required maxlength="255" placeholder="First name">
              </div>
              <div class="mb-3">
                <label for="sup-surname" class="form-label">Last Name <span class="text-danger">*</span></label>
                <input type="text" id="sup-surname" name="surname" class="form-control operatives-input" maxlength="255" placeholder="Last name">
              </div>
              <div class="mb-3">
                <label for="sup-email" class="form-label">Email <span class="text-danger">*</span></label>
                <input type="email" id="sup-email" name="email" class="form-control operatives-input" required placeholder="email@example.com">
                <div id="sup-email-invalid" class="invalid-feedback operatives-invalid">Please enter a valid email address.</div>
              </div>
              <div class="mb-3 form-check">
                <input type="checkbox" id="sup-active" name="active" class="form-check-input operatives-input" value="1">
                <label for="sup-active" class="form-check-label">Active Now?</label>
              </div>
              <div class="operatives-modal-actions">
                <button type="button" class="btn-operatives-cancel" data-dismiss="modal">Cancel</button>
                <button type="submit" class="btn-operatives-submit">Add Supervisor</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getWorkLogsHtml() {
  return `
    <section class="worklogs-module">
      <div id="worklogs-passkey-gate" class="worklogs-passkey-gate">
        <div class="worklogs-passkey-card dashboard-card">
          <h2 class="card-title">Work Logs – Restricted access</h2>
          <p class="worklogs-passkey-hint">Enter the passkey to access Work Logs.</p>
          <form id="worklogs-passkey-form" class="worklogs-passkey-form">
            <input type="password" id="worklogs-passkey-input" class="worklogs-input" placeholder="Passkey" autocomplete="off" aria-label="Passkey">
            <button type="submit" class="btn-worklogs btn-worklogs-primary">Access</button>
          </form>
          <p class="worklogs-passkey-request-wrap">
            <button type="button" class="btn-worklogs btn-worklogs-secondary" id="worklogs-btn-request-passkey">Request Pass Key</button>
          </p>
          <p id="worklogs-passkey-error" class="worklogs-passkey-error d-none" role="alert">Incorrect passkey. Try again.</p>
        </div>
      </div>
      <div id="worklogs-content-wrap" class="worklogs-content-wrap d-none">
      <div class="worklogs-analytics dashboard-card">
        <h2 class="card-title">Progress &amp; Cost</h2>
        <div class="worklogs-progress-wrap">
          <div class="worklogs-progress-label"><span id="worklogs-progress-text">0 approved / 0 total</span></div>
          <div class="worklogs-progress-bar"><div id="worklogs-progress-fill" class="worklogs-progress-fill"></div></div>
        </div>
        <div class="worklogs-cards">
          <div class="worklogs-card"><span class="worklogs-card-label">Total project cost</span><span id="worklogs-total-cost" class="worklogs-card-value">£0</span></div>
          <div class="worklogs-card"><span class="worklogs-card-label">Weekly expenses</span><span id="worklogs-weekly-cost" class="worklogs-card-value">£0</span></div>
          <div class="worklogs-card"><span class="worklogs-card-label">This month expenses</span><span id="worklogs-monthly-cost" class="worklogs-card-value">£0</span></div>
        </div>
        <div class="worklogs-chart-wrap" id="worklogs-chart-wrap"><canvas id="worklogs-chart" height="120"></canvas></div>
      </div>

      <div class="worklogs-filters dashboard-card">
        <h2 class="card-title">Pending Jobs</h2>
        <div class="worklogs-filter-row">
          <div class="worklogs-filter-group">
            <label for="worklogs-filter-worker">Worker</label>
            <select id="worklogs-filter-worker" class="worklogs-input"><option value="">All</option></select>
          </div>
          <div class="worklogs-filter-group">
            <label for="worklogs-filter-date-from">From date</label>
            <input type="date" id="worklogs-filter-date-from" class="worklogs-input" title="Start of range">
          </div>
          <div class="worklogs-filter-group">
            <label for="worklogs-filter-date-to">To date</label>
            <input type="date" id="worklogs-filter-date-to" class="worklogs-input" title="End of range">
          </div>
          <div class="worklogs-filter-group">
            <label for="worklogs-filter-project">Project</label>
            <input type="text" id="worklogs-filter-project" class="worklogs-input" placeholder="Project / Block / Floor / Apt / Zone">
          </div>
          <div class="worklogs-filter-group">
            <label for="worklogs-filter-status">Status</label>
            <select id="worklogs-filter-status" class="worklogs-input">
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="edited">Edited</option>
              <option value="waiting_worker">Waiting Worker</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div class="worklogs-filter-group worklogs-filter-search">
            <label for="worklogs-search">Search</label>
            <input type="text" id="worklogs-search" class="worklogs-input" placeholder="Job ID or description">
          </div>
        </div>
        <div class="worklogs-actions-row">
          <button type="button" class="btn-worklogs btn-worklogs-primary" id="worklogs-btn-invoice" disabled>
            <i class="bi bi-file-earmark-pdf"></i> Generate Invoice
          </button>
        </div>
      </div>

      <div class="worklogs-table-wrap dashboard-card">
        <div class="table-responsive">
          <table class="table table-hover worklogs-table" id="worklogs-table">
            <thead>
              <tr>
                <th><input type="checkbox" id="worklogs-select-all" title="Select all approved"></th>
                <th>Job ID</th>
                <th>Worker</th>
                <th>Location</th>
                <th>Work Type</th>
                <th>Qty / Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="worklogs-tbody"></tbody>
          </table>
        </div>
        <div id="worklogs-empty" class="worklogs-empty d-none">No jobs match the filters.</div>
      </div>

    <!-- Job Details Modal -->
    <div id="worklogs-modal-details" class="worklogs-modal" aria-hidden="true" role="dialog">
      <div class="worklogs-modal-backdrop" data-dismiss="worklogs-modal"></div>
      <div class="worklogs-modal-dialog worklogs-modal-dialog-lg">
        <div class="worklogs-modal-content">
          <div class="worklogs-modal-header">
            <h3>Job Details</h3>
            <button type="button" class="worklogs-modal-close" data-dismiss="worklogs-modal" aria-label="Close">&times;</button>
          </div>
          <div class="worklogs-modal-body worklogs-modal-body-scroll">
            <div id="worklogs-details-content"></div>
            <div class="worklogs-modal-actions">
              <button type="button" class="btn-worklogs btn-worklogs-secondary" data-dismiss="worklogs-modal">Close</button>
              <button type="button" class="btn-worklogs btn-worklogs-edit" id="worklogs-details-btn-edit"><i class="bi bi-pencil"></i> Edit</button>
              <button type="button" class="btn-worklogs btn-worklogs-approve" id="worklogs-details-btn-approve"><i class="bi bi-check-circle"></i> Approve</button>
              <button type="button" class="btn-worklogs btn-worklogs-reject" id="worklogs-details-btn-reject"><i class="bi bi-x-circle"></i> Reject</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Job Modal -->
    <div id="worklogs-modal-edit" class="worklogs-modal" aria-hidden="true" role="dialog">
      <div class="worklogs-modal-backdrop" data-dismiss="worklogs-modal"></div>
      <div class="worklogs-modal-dialog">
        <div class="worklogs-modal-content">
          <div class="worklogs-modal-header">
            <h3>Edit Job</h3>
            <button type="button" class="worklogs-modal-close" data-dismiss="worklogs-modal" aria-label="Close">&times;</button>
          </div>
          <div class="worklogs-modal-body worklogs-modal-body-scroll">
            <input type="hidden" id="worklogs-edit-job-id">
            <div class="worklogs-edit-fields">
              <div class="worklogs-field">
                <label for="worklogs-edit-quantity">Quantity</label>
                <input type="number" id="worklogs-edit-quantity" class="worklogs-input" min="0" step="any">
              </div>
              <div class="worklogs-field">
                <label for="worklogs-edit-unit-price">Unit Price (£)</label>
                <input type="number" id="worklogs-edit-unit-price" class="worklogs-input" min="0" step="0.01">
              </div>
              <div class="worklogs-field">
                <label for="worklogs-edit-total">Total (£)</label>
                <input type="number" id="worklogs-edit-total" class="worklogs-input" min="0" step="0.01">
              </div>
            </div>
            <div id="worklogs-edit-history" class="worklogs-edit-history"></div>
            <div class="worklogs-modal-actions">
              <button type="button" class="btn-worklogs btn-worklogs-secondary" data-dismiss="worklogs-modal">Cancel</button>
              <button type="button" class="btn-worklogs btn-worklogs-primary" id="worklogs-edit-save"><i class="bi bi-check"></i> Save</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Invoice Preview Modal (print area) -->
    <div id="worklogs-modal-invoice" class="worklogs-modal" aria-hidden="true" role="dialog">
      <div class="worklogs-modal-backdrop" data-dismiss="worklogs-modal"></div>
      <div class="worklogs-modal-dialog worklogs-modal-dialog-lg">
        <div class="worklogs-modal-content">
          <div class="worklogs-modal-header">
            <h3>Invoice</h3>
            <button type="button" class="worklogs-modal-close" data-dismiss="worklogs-modal" aria-label="Close">&times;</button>
          </div>
          <div class="worklogs-modal-body worklogs-modal-body-scroll">
            <div id="worklogs-invoice-content" class="worklogs-invoice-content"></div>
            <div class="worklogs-modal-actions">
              <button type="button" class="btn-worklogs btn-worklogs-secondary" data-dismiss="worklogs-modal">Close</button>
              <button type="button" class="btn-worklogs btn-worklogs-primary" id="worklogs-invoice-print"><i class="bi bi-printer"></i> Export PDF / Print</button>
              <button type="button" class="btn-worklogs btn-worklogs-primary" id="worklogs-invoice-send">Send to client</button>
              <button type="button" class="btn-worklogs btn-worklogs-archive" id="worklogs-invoice-archive"><i class="bi bi-archive"></i> Archive jobs</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Photo Lightbox -->
    <div id="worklogs-modal-lightbox" class="worklogs-modal worklogs-lightbox" aria-hidden="true" role="dialog">
      <div class="worklogs-modal-backdrop" data-dismiss="worklogs-modal"></div>
      <div class="worklogs-lightbox-content">
        <button type="button" class="worklogs-lightbox-close" data-dismiss="worklogs-modal" aria-label="Close">&times;</button>
        <img id="worklogs-lightbox-img" src="" alt="Photo" class="worklogs-lightbox-img">
      </div>
    </div>
      </div>
    </section>
  `;
}

function getPlantsHtml() {
  return getPlaceholderHtml('Plants (Equipment)', 'bi-truck', 'Manage plants and equipment.');
}

function getAccountingHtml() {
  return getPlaceholderHtml('Accounting', 'bi-calculator-fill', 'Financial overview and accounting.');
}

function getResourcesFilesHtml() {
  return getPlaceholderHtml('Resources & Files', 'bi-folder-fill', 'Documents and resources.');
}

function getReportsHtml() {
  return getPlaceholderHtml('Reports', 'bi-graph-up', 'Generate and view reports.');
}

function getComplainsHtml() {
  return getPlaceholderHtml('Complains', 'bi-chat-dots-fill', 'View and handle complaints.');
}

function getIssuesHtml() {
  return getPlaceholderHtml('Issues', 'bi-bug-fill', 'Track and resolve issues.');
}

router.get('/:module', requireManagerAuth, function (req, res) {
  const slug = req.params.module;
  const fn = modules[slug];
  if (!fn) {
    return res.status(404).json({ error: 'Module not found' });
  }
  const html = fn();
  res.type('html').send(html);
});

module.exports = router;
