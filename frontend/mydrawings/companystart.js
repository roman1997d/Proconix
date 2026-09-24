(function () {
  'use strict';

  var DEVICE_KEY = 'proconix_mydrawings_device';
  var $ = function (id) { return document.getElementById(id); };

  on($('cs-logo'), 'change', function () {
    var f = $('cs-logo').files && $('cs-logo').files[0];
    $('cs-logo-name').textContent = f ? f.name : 'No file selected';
  });

  on($('start-form'), 'submit', submitStart);
  on($('cs-copy'), 'click', copySiteCode);

  function on(el, ev, fn) {
    if (el) el.addEventListener(ev, fn);
  }

  function writeCompanySession(data) {
    try {
      localStorage.setItem(DEVICE_KEY, JSON.stringify({
        ok: true,
        at: Date.now(),
        role: 'admin',
        pin: '',
        deviceToken: '',
        adminToken: data.adminToken || '',
        firstName: data.managerName || data.firstName || '',
        lastName: '',
        email: data.email || '',
        managerName: data.managerName || '',
        expiresAt: data.expiresAt || '',
        siteId: (data.site && data.site.id) || (data.project && data.project.id) || ''
      }));
    } catch (e) {}
  }

  async function copySiteCode() {
    var code = ($('cs-code').textContent || '').trim();
    if (!code || code === '—') return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        throw new Error('no clipboard');
      }
      if ($('cs-copy-ok')) {
        $('cs-copy-ok').hidden = false;
        $('cs-copy-ok').textContent = 'Copied. Send it to the team.';
      }
    } catch (e) {
      if ($('cs-copy-ok')) {
        $('cs-copy-ok').hidden = false;
        $('cs-copy-ok').textContent = 'Select the code and copy it.';
      }
    }
  }

  async function submitStart(e) {
    e.preventDefault();
    var firstName = ($('cs-first').value || '').replace(/\s+/g, ' ').trim();
    var email = ($('cs-email').value || '').trim().toLowerCase();
    var password = $('cs-password').value || '';
    var repeat = $('cs-password-2').value || '';
    var name = ($('cs-name').value || '').replace(/\s+/g, ' ').trim();
    var logo = $('cs-logo').files && $('cs-logo').files[0];
    $('cs-error').textContent = '';
    if (!firstName) {
      $('cs-error').textContent = 'Enter your first name.';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      $('cs-error').textContent = 'Enter a valid email address.';
      return;
    }
    if (name.length < 2) {
      $('cs-error').textContent = 'Enter the company name.';
      return;
    }
    if (password.length < 8) {
      $('cs-error').textContent = 'Password must be at least 8 characters.';
      return;
    }
    if (password !== repeat) {
      $('cs-error').textContent = 'Passwords do not match.';
      return;
    }
    $('cs-submit').disabled = true;
    try {
      var body = new FormData();
      body.append('firstName', firstName);
      body.append('email', email);
      body.append('password', password);
      body.append('passwordRepeat', repeat);
      body.append('companyName', name);
      body.append('projectMode', 'single');
      if (logo) body.append('logo', logo);
      var res = await fetch('/api/my-drawings/company-start', {
        method: 'POST',
        credentials: 'same-origin',
        body: body
      });
      var data = null;
      try { data = await res.json(); } catch (err) { data = null; }
      if (!res.ok || (data && data.success === false)) {
        throw new Error((data && data.message) || 'Could not create the company.');
      }
      writeCompanySession(data);
      $('start-form').hidden = true;
      $('cs-done').hidden = false;
      $('cs-code').textContent = data.accessCode || '—';
      if ($('cs-admin-pin')) $('cs-admin-pin').textContent = data.adminPin || '—';
    } catch (err) {
      $('cs-error').textContent = err && err.message ? err.message : 'Could not create the company.';
    }
    $('cs-submit').disabled = false;
  }
})();
