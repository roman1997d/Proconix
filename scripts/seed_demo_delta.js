#!/usr/bin/env node
/**
 * Proconix — Demo tenant: Delta Construction
 *
 * Creates (or replaces) company + manager + 1 primary operative + 10 extra operatives
 * (random email/password each run) + 2 projects and light sample data across work logs,
 * tasks, planning, materials, QA, issues.
 *
 * Run from project root (uses .env like the app):
 *   node scripts/seed_demo_delta.js
 *
 * Credentials after run:
 *   Manager:  info@proconix.uk  /  12345678
 *   Primary operative: romand@proconix.uk  /  12345678
 *   Ten extra operatives: printed once at end of script (random credentials).
 */

'use strict';

const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { pool } = require('../backend/db/pool');
const bcrypt = require('bcrypt');

const DEMO_COMPANY_NAME = 'Delta Construction';
const PASSWORD_PLAIN = '12345678';

const EXTRA_OPERATIVE_ROLES = [
  'Plaster',
  'Dryliner',
  'Electrician',
  'Plumber',
  'Painter',
  'Carpenter',
  'Other',
  'Plaster',
  'Dryliner',
  'Electrician',
];

/** 10 demo people (first + last name). */
const EXTRA_OPERATIVE_NAMES = [
  ['James', 'Owen'],
  ['Sophie', 'Hughes'],
  ['Marcus', 'Bell'],
  ['Elena', 'Vasilescu'],
  ['Tom', 'Reed'],
  ['Amira', 'Khan'],
  ['Lewis', 'Grant'],
  ['Nina', 'Petrova'],
  ['Callum', 'Fraser'],
  ['Yasmin', 'Ali'],
];

function randomOperativePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let s = '';
  for (let i = 0; i < length; i += 1) {
    s += chars[bytes[i] % chars.length];
  }
  return s;
}

function randomOperativeEmail() {
  const token = crypto.randomBytes(5).toString('hex');
  return `delta.${token}@proconix.uk`;
}

let savepointSeq = 0;
/** Run optional inserts; missing tables/columns (42P01/42703) only skip that block. */
async function tryOptional(client, fn) {
  const sp = `sp_demo_${++savepointSeq}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await fn();
    await client.query(`RELEASE SAVEPOINT ${sp}`);
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    if (e.code !== '42P01' && e.code !== '42703') throw e;
    console.warn('  (optional) skipped:', e.message);
  }
}

/**
 * Remove previous Delta Construction demo and all dependent rows.
 * Uses SAVEPOINT per statement so missing tables (42P01) do not abort the whole transaction.
 */
async function wipeDemoCompany(client, companyId) {
  let spn = 0;
  async function sd(sql, params = []) {
    const sp = `sp_wipe_${++spn}`;
    await client.query(`SAVEPOINT ${sp}`);
    try {
      await client.query(sql, params);
      await client.query(`RELEASE SAVEPOINT ${sp}`);
    } catch (e) {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      await client.query(`RELEASE SAVEPOINT ${sp}`);
      if (e.code !== '42P01' && e.code !== '42703') throw e;
    }
  }

  const c = [companyId];

  await sd(`DELETE FROM material_consumption WHERE company_id = $1`, c);
  await sd(`DELETE FROM materials WHERE company_id = $1`, c);
  await sd(`DELETE FROM material_categories WHERE company_id = $1`, c);
  await sd(`DELETE FROM material_suppliers WHERE company_id = $1`, c);

  await sd(
    `DELETE FROM planning_plan_tasks WHERE plan_id IN (SELECT id FROM planning_plans WHERE company_id = $1)`,
    c
  );
  await sd(`DELETE FROM planning_plans WHERE company_id = $1`, c);

  await sd(
    `DELETE FROM qa_job_user_workers WHERE job_id IN (
       SELECT j.id FROM qa_jobs j
       INNER JOIN projects p ON p.id = j.project_id WHERE p.company_id = $1
     )`,
    c
  );
  await sd(
    `DELETE FROM qa_job_workers WHERE job_id IN (
       SELECT j.id FROM qa_jobs j
       INNER JOIN projects p ON p.id = j.project_id WHERE p.company_id = $1
     )`,
    c
  );
  await sd(
    `DELETE FROM qa_job_templates WHERE job_id IN (
       SELECT j.id FROM qa_jobs j
       INNER JOIN projects p ON p.id = j.project_id WHERE p.company_id = $1
     )`,
    c
  );
  await sd(
    `DELETE FROM qa_jobs WHERE project_id IN (SELECT id FROM projects WHERE company_id = $1)`,
    c
  );
  await sd(
    `DELETE FROM qa_floors WHERE project_id IN (SELECT id FROM projects WHERE company_id = $1)`,
    c
  );

  await sd(`DELETE FROM qa_workers WHERE company_id = $1`, c);
  await sd(`DELETE FROM qa_supervisors WHERE company_id = $1`, c);

  await sd(`DELETE FROM work_logs WHERE company_id = $1`, c);

  await sd(
    `DELETE FROM issues WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)`,
    c
  );
  await sd(
    `DELETE FROM tasks WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)`,
    c
  );
  await sd(
    `DELETE FROM work_hours WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)`,
    c
  );
  await sd(
    `DELETE FROM operative_task_photos WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)`,
    c
  );

  await sd(
    `DELETE FROM project_assignments WHERE project_id IN (SELECT id FROM projects WHERE company_id = $1)`,
    c
  );

  await sd(`DELETE FROM projects WHERE company_id = $1`, c);
  await sd(`DELETE FROM users WHERE company_id = $1`, c);
  await sd(`DELETE FROM manager WHERE company_id = $1`, c);
  await sd(`DELETE FROM companies WHERE id = $1`, c);
}

async function main() {
  const hash = bcrypt.hashSync(PASSWORD_PLAIN, 10);
  const client = await pool.connect();
  savepointSeq = 0;

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM companies WHERE name = $1`,
      [DEMO_COMPANY_NAME]
    );
    if (existing.rows.length > 0) {
      await wipeDemoCompany(client, existing.rows[0].id);
    }

    const insCo = await client.query(
      `INSERT INTO companies (
        name, industry_type, subscription_plan, active, created_by,
        security_question1, security_token1, office_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        DEMO_COMPANY_NAME,
        'Drylining',
        'Gold',
        'active',
        'Derek Stone',
        'Demo account (seed script)',
        'DLT001',
        '1 Canada Square, Canary Wharf, London E14 5AB, UK',
      ]
    );
    const companyId = insCo.rows[0].id;

    const mgrIns = await client.query(
      `INSERT INTO manager (
        company_id, name, surname, email, password, active,
        is_head_manager, active_status
      ) VALUES ($1, $2, $3, $4, $5, true, $6, true)
      RETURNING id`,
      [companyId, 'Derek', 'Stone', 'info@proconix.uk', hash, 'Yes']
    );
    const managerId = mgrIns.rows[0].id;

    const p1 = await client.query(
      `INSERT INTO projects (
        company_id, project_pass_key, created_by_who, project_name, address,
        start_date, planned_end_date, number_of_floors, description, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      RETURNING id`,
      [
        companyId,
        'DLT-RVT01',
        'Derek Stone',
        'Riverside Towers',
        'River Road, Manchester M3 4LP, UK',
        '2025-11-01',
        '2026-08-30',
        14,
        'Residential shell, core and drylining package — demo data.',
      ]
    );
    const p2 = await client.query(
      `INSERT INTO projects (
        company_id, project_pass_key, created_by_who, project_name, address,
        start_date, planned_end_date, number_of_floors, description, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      RETURNING id`,
      [
        companyId,
        'DLT-HWD02',
        'Derek Stone',
        'Harbour Works Depot',
        'Dock Lane, Liverpool L3 0AA, UK',
        '2026-01-10',
        '2026-10-01',
        4,
        'Warehouse fit-out, MEP coordination — demo data.',
      ]
    );
    const projectId1 = p1.rows[0].id;
    const projectId2 = p2.rows[0].id;

    let userIns;
    try {
      userIns = await client.query(
        `INSERT INTO users (
          company_id, project_id, role, name, email, password,
          active, active_status, onboarding
        ) VALUES ($1, $2, $3, $4, $5, $6, true, true, 'yes')
        RETURNING id`,
        [
          companyId,
          projectId1,
          'Dryliner',
          'Roman Demian',
          'romand@proconix.uk',
          hash,
        ]
      );
    } catch (e) {
      if (e.code === '42703') {
        userIns = await client.query(
          `INSERT INTO users (
            company_id, project_id, role, name, email, password,
            active, active_status
          ) VALUES ($1, $2, $3, $4, $5, $6, true, true)
          RETURNING id`,
          [
            companyId,
            projectId1,
            'Dryliner',
            'Roman Demian',
            'romand@proconix.uk',
            hash,
          ]
        );
      } else {
        throw e;
      }
    }
    const operativeId = userIns.rows[0].id;

    await client.query(
      `INSERT INTO project_assignments (project_id, user_id, role) VALUES ($1, $2, $3)`,
      [projectId1, operativeId, 'Dryliner']
    );
    await client.query(
      `INSERT INTO project_assignments (project_id, user_id, role) VALUES ($1, $2, $3)`,
      [projectId2, operativeId, 'Dryliner']
    );

    const extraOperativeLogins = [];

    async function insertOperativeUser(company_id, project_id, role, fullName, email, passwordHash) {
      try {
        const r = await client.query(
          `INSERT INTO users (
            company_id, project_id, role, name, email, password,
            active, active_status, onboarding
          ) VALUES ($1, $2, $3, $4, $5, $6, true, true, 'yes')
          RETURNING id`,
          [company_id, project_id, role, fullName, email, passwordHash]
        );
        return r.rows[0].id;
      } catch (e) {
        if (e.code === '42703') {
          const r = await client.query(
            `INSERT INTO users (
              company_id, project_id, role, name, email, password,
              active, active_status
            ) VALUES ($1, $2, $3, $4, $5, $6, true, true)
            RETURNING id`,
            [company_id, project_id, role, fullName, email, passwordHash]
          );
          return r.rows[0].id;
        }
        throw e;
      }
    }

    for (let i = 0; i < 10; i += 1) {
      const plainPwd = randomOperativePassword(12);
      const pwdHash = bcrypt.hashSync(plainPwd, 10);
      const em = randomOperativeEmail();
      const [fn, sn] = EXTRA_OPERATIVE_NAMES[i];
      const fullName = `${fn} ${sn}`;
      const role = EXTRA_OPERATIVE_ROLES[i];
      const homeProject = i % 2 === 0 ? projectId1 : projectId2;
      const uid = await insertOperativeUser(
        companyId,
        homeProject,
        role,
        fullName,
        em,
        pwdHash
      );
      await client.query(
        `INSERT INTO project_assignments (project_id, user_id, role) VALUES ($1, $2, $3)`,
        [projectId1, uid, role]
      );
      await client.query(
        `INSERT INTO project_assignments (project_id, user_id, role) VALUES ($1, $2, $3)`,
        [projectId2, uid, role]
      );
      extraOperativeLogins.push({
        name: fullName,
        email: em,
        password: plainPwd,
        role,
      });
    }

    await client.query(
      `INSERT INTO work_logs (
        company_id, submitted_by_user_id, project_id, job_display_id, worker_name,
        project, block, floor, apartment, zone, work_type, quantity, unit_price, total,
        status, description, photo_urls, archived
      ) VALUES
        ($1, $2, $3, 'WL-001', 'Roman Demian', 'Riverside Towers', 'A', '7', '704', 'North', 'Boarding', 120, 18.50, 2220.00, 'approved', 'Metal stud partitions — demo entry.', '[]'::jsonb, false),
        ($1, $2, $3, 'WL-002', 'Roman Demian', 'Riverside Towers', 'B', '3', '312', 'East', 'Taping & jointing', 85, 12.00, 1020.00, 'pending', 'Second fix prep — demo entry.', '[]'::jsonb, false),
        ($1, $2, $4, 'WL-003', 'Roman Demian', 'Harbour Works', 'Unit 2', 'G', '—', 'Loading', 'Ceiling grid', 40, 22.00, 880.00, 'edited', 'Suspended ceiling bays — demo entry.', '[]'::jsonb, false)`,
      [companyId, operativeId, projectId1, projectId2]
    );

    await tryOptional(client, async () => {
      await client.query(
        `INSERT INTO tasks (user_id, project_id, name, deadline, status) VALUES
          ($1, $2, 'Complete Level 7 boarding sign-off', $3::date, 'in_progress'),
          ($1, $4, 'Order acoustic insulation for Unit 2', $5::date, 'pending')`,
        [
          operativeId,
          projectId1,
          '2026-04-15',
          projectId2,
          '2026-03-20',
        ]
      );
    });

    await tryOptional(client, async () => {
      const planIns = await client.query(
        `INSERT INTO planning_plans (company_id, type, start_date, end_date, created_by)
         VALUES ($1, 'weekly', CURRENT_DATE - 1, CURRENT_DATE + 6, $2)
         RETURNING id`,
        [companyId, managerId]
      );
      const planId = planIns.rows[0].id;
      await client.query(
        `INSERT INTO planning_plan_tasks (
          plan_id, title, description, assigned_to, priority, deadline, pickup_start_date, status, send_to_assignees
        ) VALUES
          ($1, 'Site walk — Riverside L7', 'Check fire stopping and board fixings.', ARRAY['Roman Demian']::text[], 'high', NOW() + INTERVAL '3 days', CURRENT_DATE, 'in_progress', true),
          ($1, 'Deliver Harbour snag list', 'Photo upload for three open snags.', ARRAY['Roman Demian']::text[], 'medium', NOW() + INTERVAL '5 days', CURRENT_DATE + 1, 'not_started', true)`,
        [planId]
      );
    });

    await tryOptional(client, async () => {
      const catIns = await client.query(
        `INSERT INTO material_categories (company_id, name, description, created_by_id, created_by_name)
         VALUES ($1, 'Board & sheet', 'Drywall and cement board', $2, 'Derek Stone')
         RETURNING id`,
        [companyId, managerId]
      );
      const catId = catIns.rows[0].id;
      const supIns = await client.query(
        `INSERT INTO material_suppliers (company_id, name, contact, email_phone, address, created_by_id, created_by_name)
         VALUES ($1, 'BuildSupply North', 'Sarah Cole', 'orders@buildsupply.example', 'Leeds LS1', $2, 'Derek Stone')
         RETURNING id`,
        [companyId, managerId]
      );
      const supId = supIns.rows[0].id;
      await client.query(
        `INSERT INTO materials (
          project_id, company_id, name, category_id, supplier_id, unit,
          quantity_initial, quantity_used, quantity_remaining, low_stock_threshold, status,
          created_by_id, created_by_name
        ) VALUES
          ($1, $2, '12.5mm plasterboard', $3, $4, 'sheet', 400, 120, 280, 80, 'normal', $5, 'Derek Stone'),
          ($6, $2, 'Metal stud C75', $3, $4, 'length', 600, 200, 400, 150, 'normal', $5, 'Derek Stone')`,
        [projectId1, companyId, catId, supId, managerId, projectId2]
      );
    });

    await tryOptional(client, async () => {
      const st = await client.query(
        `SELECT id FROM qa_job_statuses WHERE code = 'active' LIMIT 1`
      );
      const st2 = await client.query(`SELECT id FROM qa_job_statuses ORDER BY id LIMIT 1`);
      if (!st2.rows.length) return;
      const statusId = st.rows[0] ? st.rows[0].id : st2.rows[0].id;
      const ct = await client.query(`SELECT id FROM qa_cost_types WHERE code = 'day' LIMIT 1`);
      const costTypeId = ct.rows[0] ? ct.rows[0].id : null;
      const qc = await client.query(`SELECT id FROM qa_worker_categories ORDER BY id LIMIT 1`);
      if (!qc.rows.length) return;
      const workerCatId = qc.rows[0].id;
      const supv = await client.query(
        `INSERT INTO qa_supervisors (company_id, name) VALUES ($1, 'Alex Morgan') RETURNING id`,
        [companyId]
      );
      const supvId = supv.rows[0].id;
      await client.query(
        `INSERT INTO qa_workers (company_id, name, category_id) VALUES ($1, 'Roman Demian', $2) RETURNING id`,
        [companyId, workerCatId]
      );
      const fl1 = await client.query(
        `INSERT INTO qa_floors (project_id, code, label, sort_order) VALUES ($1, 'L7', 'Level 7', 7) RETURNING id`,
        [projectId1]
      );
      const floorId1 = fl1.rows[0].id;
      await client.query(
        `INSERT INTO qa_jobs (
          project_id, job_number, floor_id, floor_code, location, description,
          target_completion_date, cost_included, cost_type_id, cost_value,
          responsible_id, status_id, created_by
        ) VALUES ($1, 'QA-001', $2, 'L7', 'Core shafts — Block A', 'Fire-rated lining inspection checklist.', CURRENT_DATE + 20, true, $3, '1800', $4, $5, 'Derek Stone')`,
        [projectId1, floorId1, costTypeId, supvId, statusId]
      );
    });

    await tryOptional(client, async () => {
      await client.query(
        `INSERT INTO issues (user_id, project_id, title, description) VALUES ($1, $2, $3, $4)`,
        [
          operativeId,
          projectId1,
          'Damaged board delivery',
          'Three sheets corner-crushed on pallet 12 — demo issue for client review.',
        ]
      );
    });

    await tryOptional(client, async () => {
      await client.query(
        `INSERT INTO work_hours (user_id, project_id, clock_in, clock_out) VALUES ($1, $2, NOW() - INTERVAL '8 hours', NOW() - INTERVAL '1 hour')`,
        [operativeId, projectId1]
      );
    });

    await client.query('COMMIT');

    console.log('');
    console.log('=== Proconix demo seed complete ===');
    console.log('Company:  Delta Construction  (id ' + companyId + ')');
    console.log('');
    console.log('Manager login (dashboard):');
    console.log('  Email:    info@proconix.uk');
    console.log('  Password: ' + PASSWORD_PLAIN);
    console.log('');
    console.log('Primary operative login:');
    console.log('  Email:    romand@proconix.uk');
    console.log('  Password: ' + PASSWORD_PLAIN);
    console.log('');
    console.log('10 extra operatives (random email & password — copy this list; it is not saved elsewhere):');
    extraOperativeLogins.forEach(function (row, idx) {
      console.log(
        '  ' +
          String(idx + 1).padStart(2, ' ') +
          '. ' +
          row.name.padEnd(22, ' ') +
          ' | ' +
          row.email.padEnd(34, ' ') +
          ' | ' +
          row.password +
          ' | ' +
          row.role
      );
    });
    console.log('');
    console.log('Projects: Riverside Towers (id ' + projectId1 + '), Harbour Works Depot (id ' + projectId2 + ')');
    console.log('Sample data (where tables exist): work logs, tasks, planning, materials, QA job, issues, work hours.');
    console.log('Re-run anytime: it removes the previous "Delta Construction" demo first.');
    console.log('');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
