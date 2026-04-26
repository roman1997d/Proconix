/**
 * Proconix — Create a full demo tenant (company, head manager, operatives, projects,
 * work logs, tasks, planning, materials, QA, issues, work hours) for client previews.
 * Used by POST /api/platform-admin/create-demo-records and scripts/create_demo_records.js.
 */

'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

const PRIMARY_OPERATIVE_NAME = 'Demo Operative';

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

function randomOperativeEmail(domain) {
  const token = crypto.randomBytes(5).toString('hex');
  const d = domain && String(domain).trim() ? String(domain).trim() : 'demo.local';
  return `demo.${token}@${d}`;
}

function generateProjectPassKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 10; i += 1) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

function splitManagerName(full) {
  const t = String(full || '').trim();
  if (!t) return { firstName: 'Demo', surname: 'Manager' };
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], surname: 'Manager' };
  return { firstName: parts[0], surname: parts.slice(1).join(' ') };
}

function buildDemoUnitProgressWorkspace(projectId1, projectId2, managerDisplayName) {
  const now = Date.now();
  const iso = (daysAgo) => new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  const actor = managerDisplayName || 'Demo Manager';
  return {
    towers: [
      { id: 'A', name: 'Tower A' },
      { id: 'B', name: 'Tower B' },
    ],
    floors: [
      { id: 'A-1', tower: 'A', number: 1, name: 'Floor 1' },
      { id: 'A-2', tower: 'A', number: 2, name: 'Floor 2' },
      { id: 'B-1', tower: 'B', number: 1, name: 'Floor 1' },
      { id: 'B-2', tower: 'B', number: 2, name: 'Floor 2' },
    ],
    units: [
      {
        id: 101,
        name: 'Apartment 101',
        tower: 'A',
        floor: 1,
        project_id: projectId1,
        timeline: [
          {
            stage: 'First fix',
            status: 'In progress',
            reason: '',
            comment: 'Stud framing is complete in kitchen and hallway.',
            user: actor,
            date: iso(12),
            photos: [],
          },
          {
            stage: 'Insulation',
            status: 'Done',
            reason: '',
            comment: 'Acoustic insulation installed and verified.',
            user: actor,
            date: iso(8),
            photos: [],
          },
        ],
      },
      {
        id: 102,
        name: 'Apartment 102',
        tower: 'A',
        floor: 1,
        project_id: projectId1,
        timeline: [
          {
            stage: 'First fix',
            status: 'Blocked',
            reason: 'Awaiting MEP clearance',
            comment: 'Drylining paused until cable containment reroute is closed.',
            user: actor,
            date: iso(6),
            photos: [],
          },
        ],
      },
      {
        id: 201,
        name: 'Apartment 201',
        tower: 'A',
        floor: 2,
        project_id: projectId1,
        timeline: [],
      },
      {
        id: 202,
        name: 'Apartment 202',
        tower: 'A',
        floor: 2,
        project_id: projectId1,
        timeline: [
          {
            stage: 'Second fix',
            status: 'In progress',
            reason: '',
            comment: 'Jointing first coat completed; waiting for dry check.',
            user: actor,
            date: iso(2),
            photos: [],
          },
        ],
      },
      {
        id: 301,
        name: 'Unit 301',
        tower: 'B',
        floor: 1,
        project_id: projectId2,
        timeline: [],
      },
      {
        id: 302,
        name: 'Unit 302',
        tower: 'B',
        floor: 1,
        project_id: projectId2,
        timeline: [],
      },
      {
        id: 401,
        name: 'Unit 401',
        tower: 'B',
        floor: 2,
        project_id: projectId2,
        timeline: [],
      },
      {
        id: 402,
        name: 'Unit 402',
        tower: 'B',
        floor: 2,
        project_id: projectId2,
        timeline: [],
      },
    ],
    updated_at: new Date().toISOString(),
  };
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
  await sd(`DELETE FROM qa_templates WHERE company_id = $1`, c);

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

  await sd(`DELETE FROM unit_progress_state WHERE company_id = $1`, c);

  await sd(`DELETE FROM projects WHERE company_id = $1`, c);
  await sd(`DELETE FROM users WHERE company_id = $1`, c);
  await sd(`DELETE FROM manager WHERE company_id = $1`, c);
  await sd(`DELETE FROM companies WHERE id = $1`, c);
}

/**
 * Insert demo data. Caller must manage transaction (BEGIN / COMMIT / ROLLBACK) and pass a connected client.
 * @param {import('pg').PoolClient} client
 * @param {{ companyName: string, headManagerName: string, email: string, password: string }} options
 * @returns {Promise<object>} summary for API / CLI
 */
async function runCreateDemoRecords(client, options) {
  const companyName = typeof options.companyName === 'string' ? options.companyName.trim() : '';
  const headManagerName = typeof options.headManagerName === 'string' ? options.headManagerName.trim() : '';
  const email = typeof options.email === 'string' ? options.email.trim() : '';
  const password = typeof options.password === 'string' ? options.password : '';

  if (!companyName || companyName.length < 2) {
    const e = new Error('Company name is required (at least 2 characters).');
    e.code = 'VALIDATION';
    throw e;
  }
  if (!headManagerName || headManagerName.length < 2) {
    const e = new Error('Head manager name is required (at least 2 characters).');
    e.code = 'VALIDATION';
    throw e;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const e = new Error('A valid head manager email is required.');
    e.code = 'VALIDATION';
    throw e;
  }
  if (!password || password.length < 8) {
    const e = new Error('Password must be at least 8 characters.');
    e.code = 'VALIDATION';
    throw e;
  }

  const dupCo = await client.query(
    `SELECT id FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
    [companyName]
  );
  if (dupCo.rows.length > 0) {
    const e = new Error('A company with this name already exists.');
    e.code = 'DUPLICATE_COMPANY';
    throw e;
  }
  const dupEm = await client.query(
    `SELECT id FROM manager WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))`,
    [email]
  );
  if (dupEm.rows.length > 0) {
    const e = new Error('This manager email is already registered.');
    e.code = 'DUPLICATE_EMAIL';
    throw e;
  }

  const { firstName: headFirst, surname: headLast } = splitManagerName(headManagerName);
  const createdByLabel = `${headFirst} ${headLast}`.trim();
  const emailDomain = (email.includes('@') ? email.split('@')[1] : 'demo.local').trim() || 'demo.local';
  const operativeEmail = `demo.op.${crypto.randomBytes(4).toString('hex')}@${emailDomain}`;
  const demoToken = `DEMO-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  savepointSeq = 0;

  const hash = passwordHash;

    const insCo = await client.query(
      `INSERT INTO companies (
        name, industry_type, subscription_plan, active, created_by,
        security_question1, security_token1, office_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        companyName,
        'Drylining',
        'Gold',
        'active',
        createdByLabel,
        'Demo account (platform demo seed)',
        demoToken,
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
      [companyId, headFirst, headLast, email, hash, 'Yes']
    );
    const managerId = mgrIns.rows[0].id;

    const passKey1 = generateProjectPassKey();
    const passKey2 = generateProjectPassKey();

    const p1 = await client.query(
      `INSERT INTO projects (
        company_id, project_pass_key, created_by_who, project_name, address,
        start_date, planned_end_date, number_of_floors, description, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      RETURNING id`,
      [
        companyId,
        passKey1,
        createdByLabel,
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
        passKey2,
        createdByLabel,
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
          PRIMARY_OPERATIVE_NAME,
          operativeEmail,
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
            PRIMARY_OPERATIVE_NAME,
            operativeEmail,
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
    const allOperativeIds = [operativeId];
    const allOperativeNames = [PRIMARY_OPERATIVE_NAME];

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
      const em = randomOperativeEmail(emailDomain);
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
      allOperativeIds.push(uid);
      allOperativeNames.push(fullName);
    }

    const u1 = allOperativeIds[1];
    const u2 = allOperativeIds[2];
    const u3 = allOperativeIds[3];
    const u4 = allOperativeIds[4];

    await client.query(
      `INSERT INTO work_logs (
        company_id, submitted_by_user_id, project_id, job_display_id, worker_name,
        project, block, floor, apartment, zone, work_type, quantity, unit_price, total,
        status, description, photo_urls, archived
      ) VALUES
        ($1, $2, $3, 'WL-001', '${PRIMARY_OPERATIVE_NAME.replace(/'/g, "''")}', 'Riverside Towers', 'A', '7', '704', 'North', 'Boarding', 120, 18.50, 2220.00, 'approved', 'Metal stud partitions — demo entry.', '[]'::jsonb, false),
        ($1, $2, $3, 'WL-002', '${PRIMARY_OPERATIVE_NAME.replace(/'/g, "''")}', 'Riverside Towers', 'B', '3', '312', 'East', 'Taping & jointing', 85, 12.00, 1020.00, 'pending', 'Second fix prep — demo entry.', '[]'::jsonb, false),
        ($1, $2, $4, 'WL-003', '${PRIMARY_OPERATIVE_NAME.replace(/'/g, "''")}', 'Harbour Works', 'Unit 2', 'G', '—', 'Loading', 'Ceiling grid', 40, 22.00, 880.00, 'edited', 'Suspended ceiling bays — demo entry.', '[]'::jsonb, false),
        ($1, $5, $3, 'WL-004', 'James Owen', 'Riverside Towers', 'C', '5', '512', 'West', 'Dot & dab', 95, 14.25, 1353.75, 'pending', 'Demo: adhesive dabbed boards — awaiting sign-off.', '[]'::jsonb, false),
        ($1, $6, $4, 'WL-005', 'Sophie Hughes', 'Harbour Works', 'Unit 1', 'L1', '—', 'Store', 'First fix containment', 32, 45.00, 1440.00, 'approved', 'Demo: trunking runs and box-outs.', '[]'::jsonb, false),
        ($1, $7, $3, 'WL-006', 'Marcus Bell', 'Riverside Towers', 'A', '9', '902', 'Core', 'Fire stopping', 18, 120.00, 2160.00, 'pending', 'Demo: penetration seals — photos attached later.', '[]'::jsonb, false),
        ($1, $8, $4, 'WL-007', 'Elena Vasilescu', 'Harbour Works', 'Yard', '—', '—', 'External', 'Scaffold handover', 1, 350.00, 350.00, 'edited', 'Demo: access tower sign-off sheet.', '[]'::jsonb, false)`,
      [companyId, operativeId, projectId1, projectId2, u1, u2, u3, u4]
    );

    const DEMO_OPERATIVE_TASKS = [
      { name: 'Complete Level 7 boarding sign-off', days: 21, status: 'in_progress' },
      { name: 'Order acoustic insulation for Unit 2', days: 7, status: 'pending' },
      { name: 'Verify corridor ceiling deflection strips', days: 14, status: 'pending' },
      { name: 'Submit O&M cut sheets for MEP risers', days: 30, status: 'in_progress' },
      { name: 'Patch and sand Level 5 demo flats', days: 10, status: 'completed' },
      { name: 'Coordinate hoist booking for board delivery', days: 5, status: 'pending' },
      { name: 'Label waste streams at Harbour compound', days: 3, status: 'in_progress' },
      { name: 'Second coat mist to Block B apartments', days: 12, status: 'pending' },
      { name: 'Toolbox talk — manual handling refresher', days: 2, status: 'completed' },
      { name: 'Upload weekly progress photos to manager', days: 1, status: 'pending' },
    ];

    await tryOptional(client, async () => {
      for (let t = 0; t < DEMO_OPERATIVE_TASKS.length; t += 1) {
        const row = DEMO_OPERATIVE_TASKS[t];
        const uid = allOperativeIds[t % allOperativeIds.length];
        const pid = t % 2 === 0 ? projectId1 : projectId2;
        await client.query(
          `INSERT INTO tasks (user_id, project_id, name, deadline, status)
           VALUES ($1, $2, $3, CURRENT_DATE + ($4::int), $5)`,
          [uid, pid, row.name, row.days, row.status]
        );
      }
    });

    const DEMO_PLANNING_TASKS = [
      {
        title: 'Site walk — Riverside L7',
        description: 'Check fire stopping and board fixings.',
        priority: 'high',
        status: 'in_progress',
        dayOff: 3,
      },
      {
        title: 'Deliver Harbour snag list',
        description: 'Photo upload for three open snags.',
        priority: 'medium',
        status: 'not_started',
        dayOff: 5,
      },
      {
        title: 'Approve metal stud delivery note',
        description: 'Match BOL to PO-DLT-8841.',
        priority: 'low',
        status: 'not_started',
        dayOff: 2,
      },
      {
        title: 'Client walk — Level 9 show flat',
        description: 'Drylining and decoration ready for inspection.',
        priority: 'critical',
        status: 'in_progress',
        dayOff: 7,
      },
      {
        title: 'Programme review with drylining lead',
        description: 'Re-baseline Harbour milestone dates.',
        priority: 'medium',
        status: 'paused',
        dayOff: 4,
      },
      {
        title: 'Order intumescent mastic stock',
        description: 'Low stock alert from stores.',
        priority: 'high',
        status: 'not_started',
        dayOff: 1,
      },
      {
        title: 'Briefing — acoustic details Block C',
        description: 'Issue marked-up PDFs to gangs.',
        priority: 'medium',
        status: 'completed',
        dayOff: 0,
      },
      {
        title: 'Scaffold inspection follow-up',
        description: 'Close out tags from last lift.',
        priority: 'high',
        status: 'in_progress',
        dayOff: 6,
      },
      {
        title: 'Waste transfer note filing',
        description: 'Harbour yard — week 12 bundle.',
        priority: 'low',
        status: 'not_started',
        dayOff: 8,
      },
      {
        title: 'Subcontractor induction slots',
        description: 'Book two slots for ceiling specialist.',
        priority: 'medium',
        status: 'not_started',
        dayOff: 9,
      },
    ];

    await tryOptional(client, async () => {
      const planIns = await client.query(
        `INSERT INTO planning_plans (company_id, type, start_date, end_date, created_by)
         VALUES ($1, 'weekly', CURRENT_DATE - 1, CURRENT_DATE + 13, $2)
         RETURNING id`,
        [companyId, managerId]
      );
      const planId = planIns.rows[0].id;
      for (let p = 0; p < DEMO_PLANNING_TASKS.length; p += 1) {
        const pt = DEMO_PLANNING_TASKS[p];
        const assignee = allOperativeNames[p % allOperativeNames.length];
        await client.query(
          `INSERT INTO planning_plan_tasks (
            plan_id, title, description, assigned_to, priority, deadline, pickup_start_date, status, send_to_assignees
          ) VALUES ($1, $2, $3, $4, $5, NOW() + ($6::int) * INTERVAL '1 day', CURRENT_DATE + ($6::int), $7, true)`,
          [planId, pt.title, pt.description, [assignee], pt.priority, pt.dayOff, pt.status]
        );
      }
    });

    await tryOptional(client, async () => {
      const catBoard = await client.query(
        `INSERT INTO material_categories (company_id, name, description, created_by_id, created_by_name)
         VALUES ($1, 'Board & sheet', 'Drywall and cement board', $2, $3) RETURNING id`,
        [companyId, managerId, createdByLabel]
      );
      const catInsul = await client.query(
        `INSERT INTO material_categories (company_id, name, description, created_by_id, created_by_name)
         VALUES ($1, 'Insulation & acoustic', 'Wool, foam, barriers', $2, $3) RETURNING id`,
        [companyId, managerId, createdByLabel]
      );
      const catFix = await client.query(
        `INSERT INTO material_categories (company_id, name, description, created_by_id, created_by_name)
         VALUES ($1, 'Fixings & metal', 'Screws, channels, brackets', $2, $3) RETURNING id`,
        [companyId, managerId, createdByLabel]
      );
      const catFinish = await client.query(
        `INSERT INTO material_categories (company_id, name, description, created_by_id, created_by_name)
         VALUES ($1, 'Finishes', 'Compounds, tapes, primers', $2, $3) RETURNING id`,
        [companyId, managerId, createdByLabel]
      );
      const cBoard = catBoard.rows[0].id;
      const cInsul = catInsul.rows[0].id;
      const cFix = catFix.rows[0].id;
      const cFin = catFinish.rows[0].id;

      const sup1 = await client.query(
        `INSERT INTO material_suppliers (company_id, name, contact, email_phone, address, created_by_id, created_by_name)
         VALUES ($1, 'BuildSupply North', 'Sarah Cole', 'orders@buildsupply.example', 'Leeds LS1', $2, $3) RETURNING id`,
        [companyId, managerId, createdByLabel]
      );
      const sup2 = await client.query(
        `INSERT INTO material_suppliers (company_id, name, contact, email_phone, address, created_by_id, created_by_name)
         VALUES ($1, 'ProDry Trade', 'James Patel', '+44 161 555 0100', 'Manchester M4', $2, $3) RETURNING id`,
        [companyId, managerId, createdByLabel]
      );
      const sup3 = await client.query(
        `INSERT INTO material_suppliers (company_id, name, contact, email_phone, address, created_by_id, created_by_name)
         VALUES ($1, 'Northern Fix Ltd', 'Chris Byrne', 'sales@northernfix.example', 'Liverpool L2', $2, $3) RETURNING id`,
        [companyId, managerId, createdByLabel]
      );
      const s1 = sup1.rows[0].id;
      const s2 = sup2.rows[0].id;
      const s3 = sup3.rows[0].id;

      const materialRows = [
        [projectId1, '12.5mm plasterboard', cBoard, s1, 'sheet', 400, 120, 280, 80, 'normal'],
        [projectId2, '15mm fire board Type A', cBoard, s1, 'sheet', 220, 90, 130, 40, 'normal'],
        [projectId1, 'Cement board 6mm', cBoard, s2, 'sheet', 80, 55, 25, 20, 'low'],
        [projectId2, 'Moisture board green', cBoard, s3, 'sheet', 150, 148, 2, 30, 'out'],
        [projectId1, 'Metal stud C75', cFix, s1, 'length', 600, 200, 400, 150, 'normal'],
        [projectId2, 'Metal stud C100', cFix, s2, 'length', 400, 120, 280, 100, 'normal'],
        [projectId1, 'U-channel floor track', cFix, s1, 'length', 500, 180, 320, 120, 'normal'],
        [projectId2, 'Resilient bar pack', cFix, s3, 'pack', 120, 40, 80, 25, 'normal'],
        [projectId1, 'Drywall screws 35mm', cFix, s2, 'box', 200, 95, 105, 40, 'normal'],
        [projectId2, 'Wafer head screws', cFix, s2, 'box', 180, 170, 10, 50, 'low'],
        [projectId1, 'Acoustic wool roll 50mm', cInsul, s3, 'roll', 90, 30, 60, 20, 'normal'],
        [projectId2, 'PIR board 75mm', cInsul, s1, 'sheet', 60, 20, 40, 15, 'normal'],
        [projectId1, 'Acoustic sealant grey', cInsul, s2, 'tube', 240, 100, 140, 48, 'normal'],
        [projectId2, 'Rockwool slab 100mm', cInsul, s1, 'pack', 45, 12, 33, 10, 'normal'],
        [projectId1, 'Vapour barrier roll', cInsul, s3, 'roll', 25, 5, 20, 8, 'normal'],
        [projectId2, 'Intumescent mastic', cFin, s2, 'tube', 80, 72, 8, 24, 'low'],
        [projectId1, 'Jointing compound 25kg', cFin, s1, 'bag', 70, 45, 25, 20, 'normal'],
        [projectId2, 'Tape paper 50mm', cFin, s1, 'roll', 300, 200, 100, 80, 'normal'],
        [projectId1, 'Corner bead metal', cFin, s3, 'length', 400, 250, 150, 100, 'normal'],
        [projectId2, 'Skim finish bags', cFin, s2, 'bag', 55, 30, 25, 15, 'normal'],
        [projectId1, 'Primer sealer 10L', cFin, s3, 'tub', 40, 18, 22, 10, 'normal'],
        [projectId2, 'Sandpaper discs P120', cFin, s2, 'box', 90, 60, 30, 25, 'normal'],
      ];

      for (let m = 0; m < materialRows.length; m += 1) {
        const r = materialRows[m];
        await client.query(
          `INSERT INTO materials (
            project_id, company_id, name, category_id, supplier_id, unit,
            quantity_initial, quantity_used, quantity_remaining, low_stock_threshold, status,
            created_by_id, created_by_name
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            r[0],
            companyId,
            r[1],
            r[2],
            r[3],
            r[4],
            r[5],
            r[6],
            r[7],
            r[8],
            r[9],
            managerId,
            createdByLabel,
          ]
        );
      }
    });

    await tryOptional(client, async () => {
      const stNew = await client.query(`SELECT id FROM qa_job_statuses WHERE code = 'new' LIMIT 1`);
      const stAct = await client.query(`SELECT id FROM qa_job_statuses WHERE code = 'active' LIMIT 1`);
      const stComp = await client.query(`SELECT id FROM qa_job_statuses WHERE code = 'completed' LIMIT 1`);
      const stAny = await client.query(`SELECT id FROM qa_job_statuses ORDER BY id LIMIT 1`);
      if (!stAny.rows.length) return;
      const idNew = stNew.rows[0] ? stNew.rows[0].id : stAny.rows[0].id;
      const idAct = stAct.rows[0] ? stAct.rows[0].id : idNew;
      const idComp = stComp.rows[0] ? stComp.rows[0].id : idNew;

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

      const wIns = await client.query(
        `INSERT INTO qa_workers (company_id, name, category_id) VALUES ($1, $2, $3) RETURNING id`,
        [companyId, PRIMARY_OPERATIVE_NAME, workerCatId]
      );
      const qaWorkerId = wIns.rows[0].id;

      const floorDefs = [
        [projectId1, 'L5', 'Level 5', 5],
        [projectId1, 'L7', 'Level 7', 7],
        [projectId1, 'L9', 'Level 9', 9],
        [projectId2, 'G', 'Ground', 0],
        [projectId2, 'L1', 'Level 1', 1],
        [projectId2, 'U2', 'Unit 2', 2],
      ];
      const floorByKey = {};
      for (let fi = 0; fi < floorDefs.length; fi += 1) {
        const f = floorDefs[fi];
        const fr = await client.query(
          `INSERT INTO qa_floors (project_id, code, label, sort_order) VALUES ($1, $2, $3, $4) RETURNING id, code`,
          f
        );
        floorByKey[`${f[0]}:${fr.rows[0].code}`] = fr.rows[0].id;
      }

      async function insertQaTemplate(name, projId, steps) {
        let ins;
        try {
          ins = await client.query(
            `INSERT INTO qa_templates (name, created_by, company_id, project_id)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [name, createdByLabel, companyId, projId]
          );
        } catch (e) {
          if (e.code !== '42703') throw e;
          ins = await client.query(
            `INSERT INTO qa_templates (name, created_by) VALUES ($1, $2) RETURNING id`,
            [name, createdByLabel]
          );
        }
        const tid = ins.rows[0].id;
        for (let si = 0; si < steps.length; si += 1) {
          await client.query(
            `INSERT INTO qa_template_steps (
              template_id, sort_order, description, price_per_m2, price_per_unit, price_per_linear, step_external_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [tid, si, steps[si], '', '', '', 'demo_seed_' + tid + '_' + si]
          );
        }
        return tid;
      }

      const tplPartition = await insertQaTemplate('Partition — metal frame demo', projectId1, [
        'Install head and floor track to line and level.',
        'Fix I-studs at 600mm centres; brace openings.',
        'Board both sides; stagger joints; fire detail to spec.',
      ]);
      const tplAcoustic = await insertQaTemplate('Acoustic lining package', projectId1, [
        'Resilient bars fixed per drawing A-07.',
        'Insulation full fill; no compression at perimeters.',
        'Double layer 12.5mm; seal perimeters with acoustic mastic.',
      ]);
      const tplCeiling = await insertQaTemplate('Suspended MF ceiling', projectId1, [
        'Grid layout verified against reflected ceiling plan.',
        'Hanger spacing and load test records on file.',
        'Tiles and trims; access panels aligned to MEP.',
      ]);
      const tplFire = await insertQaTemplate('Fire compartmentation snag', projectId2, [
        'Penetration seals — photo each service.',
        'Head of wall deflection detail signed off.',
        'Intumescent paint touch-up where exposed.',
      ]);
      const tplMep = await insertQaTemplate('MEP first fix coordination', projectId2, [
        'Set-out vs grid; clashes logged in Proconix.',
        'Box-outs and riser sleeves verified.',
        'Drylining clearance for cable containment.',
      ]);

      async function insertQaJob(
        projId,
        jobNumber,
        floorCode,
        location,
        description,
        statusId,
        templateIds
      ) {
        const fk = `${projId}:${floorCode}`;
        const floorId = floorByKey[fk];
        const jr = await client.query(
          `INSERT INTO qa_jobs (
            project_id, job_number, job_title, floor_id, floor_code, location, sqm, total_units, specification, description,
            target_completion_date, cost_included, cost_type_id, cost_value,
            responsible_id, status_id, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE + 25, true, $11, $12, $13, $14, $15)
          RETURNING id`,
          [
            projId,
            jobNumber,
            `Demo job ${jobNumber}`,
            floorId,
            floorCode,
            location,
            '120',
            '8',
            'Demo spec — platform seed',
            description,
            costTypeId,
            '1850',
            supvId,
            statusId,
            createdByLabel,
          ]
        );
        const jid = jr.rows[0].id;
        for (let ti = 0; ti < templateIds.length; ti += 1) {
          await client.query(`INSERT INTO qa_job_templates (job_id, template_id) VALUES ($1, $2)`, [
            jid,
            templateIds[ti],
          ]);
        }
        await client.query(`INSERT INTO qa_job_workers (job_id, worker_id) VALUES ($1, $2)`, [
          jid,
          qaWorkerId,
        ]);
        try {
          await client.query(`INSERT INTO qa_job_user_workers (job_id, user_id) VALUES ($1, $2)`, [
            jid,
            operativeId,
          ]);
        } catch (uwErr) {
          if (uwErr.code !== '42P01') throw uwErr;
        }
      }

      await insertQaJob(
        projectId1,
        'QA-RVT-001',
        'L7',
        'Core shafts — Block A',
        'Fire-rated lining inspection — demo job.',
        idAct,
        [tplPartition, tplAcoustic]
      );
      await insertQaJob(
        projectId1,
        'QA-RVT-002',
        'L5',
        'Typical apartments — wing B',
        'Acoustic pre-handover sample sign-off.',
        idNew,
        [tplAcoustic]
      );
      await insertQaJob(
        projectId1,
        'QA-RVT-003',
        'L9',
        'Show flat 904',
        'Client demonstration quality gate.',
        idAct,
        [tplPartition, tplCeiling]
      );
      await insertQaJob(
        projectId1,
        'QA-RVT-004',
        'L9',
        'Corridor soffits',
        'MF ceiling package — level and lighting cut-outs.',
        idComp,
        [tplCeiling]
      );
      await insertQaJob(
        projectId2,
        'QA-HWD-001',
        'G',
        'Goods in — loading bay',
        'Fire stopping at dock level — demo.',
        idAct,
        [tplFire]
      );
      await insertQaJob(
        projectId2,
        'QA-HWD-002',
        'L1',
        'Open plan office shell',
        'Partition grid QA before MEP second fix.',
        idNew,
        [tplPartition, tplMep]
      );
      await insertQaJob(
        projectId2,
        'QA-HWD-003',
        'U2',
        'Warehouse storage cell',
        'Compartment wall continuity check.',
        idAct,
        [tplFire, tplPartition]
      );
      await insertQaJob(
        projectId2,
        'QA-HWD-004',
        'U2',
        'Plant deck access',
        'Coordination snag list from walk-down.',
        idComp,
        [tplMep]
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

    await tryOptional(client, async () => {
      const unitWorkspace = buildDemoUnitProgressWorkspace(projectId1, projectId2, createdByLabel);
      await client.query(
        `INSERT INTO unit_progress_state (company_id, workspace, updated_by_kind, updated_by_id, updated_at)
         VALUES ($1, $2::jsonb, 'manager', $3, NOW())`,
        [companyId, JSON.stringify(unitWorkspace), managerId]
      );
    });

    return {
      company_id: companyId,
      company_name: companyName,
      manager_id: managerId,
      head_manager_email: email,
      project_ids: [projectId1, projectId2],
      project_names: ['Riverside Towers', 'Harbour Works Depot'],
      primary_operative_email: operativeEmail,
      primary_operative_name: PRIMARY_OPERATIVE_NAME,
      extra_operatives: extraOperativeLogins,
      message:
        'Demo tenant created: 2 projects, 7 work logs, 10 operative tasks, 10 planning tasks, materials, QA, issues, work hours, and Unit Progress workspace (where tables exist).',
    };
}

module.exports = {
  runCreateDemoRecords,
  wipeDemoCompany,
};
