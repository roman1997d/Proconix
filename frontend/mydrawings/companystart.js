(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  on($('cs-logo'), 'change', function () {
    var f = $('cs-logo').files && $('cs-logo').files[0];
    $('cs-logo-name').textContent = f ? f.name : 'No file selected';
  });

  on($('start-form'), 'submit', submitStart);

  function on(el, ev, fn) {
    if (el) el.addEventListener(ev, fn);
  }

  async function submitStart(e) {
    e.preventDefault();
    var email = ($('cs-email').value || '').trim().toLowerCase();
    var password = $('cs-password').value || '';
    var repeat = $('cs-password-2').value || '';
    var name = ($('cs-name').value || '').replace(/\s+/g, ' ').trim();
    var mode = (document.querySelector('input[name="cs-mode"]:checked') || {}).value || 'single';
    var logo = $('cs-logo').files && $('cs-logo').files[0];
    $('cs-error').textContent = '';
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
      body.append('email', email);
      body.append('password', password);
      body.append('passwordRepeat', repeat);
      body.append('companyName', name);
      body.append('projectMode', mode);
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
      $('start-form').hidden = true;
      $('cs-done').hidden = false;
      $('cs-code').textContent = data.accessCode || '—';
    } catch (err) {
      $('cs-error').textContent = err && err.message ? err.message : 'Could not create the company.';
    }
    $('cs-submit').disabled = false;
  }
})();
