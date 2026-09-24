(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var token = '';

  function on(el, ev, fn) {
    if (el) el.addEventListener(ev, fn);
  }

  function queryToken() {
    try {
      return new URLSearchParams(window.location.search).get('token') || '';
    } catch (e) {
      return '';
    }
  }

  async function preview() {
    token = String(queryToken() || '').trim();
    if (!token) {
      $('rp-hint').textContent = 'This reset link is missing. Request a new one from Company sign in.';
      return;
    }
    try {
      var res = await fetch('/api/my-drawings/company-reset-password?token=' + encodeURIComponent(token), {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok || !data || data.success === false) {
        $('rp-hint').textContent = (data && data.message) || 'This reset link is invalid or has expired.';
        return;
      }
      if (data.companyName) {
        $('rp-hint').textContent =
          'Reset the password for ' + data.companyName + '. Enter a new password and one site access code (host code) from this company.';
      }
      $('rp-form').hidden = false;
      setTimeout(function () {
        if ($('rp-password')) $('rp-password').focus();
      }, 80);
    } catch (err) {
      $('rp-hint').textContent = 'Could not check the reset link. Try again.';
    }
  }

  async function submit(e) {
    e.preventDefault();
    var password = ($('rp-password').value || '');
    var repeat = ($('rp-password-2').value || '');
    var host = ($('rp-host').value || '').replace(/\s+/g, '').toUpperCase();
    $('rp-error').textContent = '';
    if (password.length < 8) {
      $('rp-error').textContent = 'Password must be at least 8 characters.';
      return;
    }
    if (password !== repeat) {
      $('rp-error').textContent = 'Passwords do not match.';
      return;
    }
    if (!/^[A-Z0-9]{6,10}$/.test(host)) {
      $('rp-error').textContent = 'Enter one site access code (host code) from this company.';
      return;
    }
    $('rp-submit').disabled = true;
    try {
      var res = await fetch('/api/my-drawings/company-reset-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          token: token,
          password: password,
          passwordRepeat: repeat,
          accessCode: host
        })
      });
      var data = null;
      try { data = await res.json(); } catch (err) { data = null; }
      if (!res.ok || !data || data.success === false) {
        throw new Error((data && data.message) || 'Could not reset the password.');
      }
      $('rp-form').hidden = true;
      $('rp-done').hidden = false;
      $('rp-hint').textContent = data.message || 'Password updated.';
    } catch (err) {
      $('rp-error').textContent = err && err.message ? err.message : 'Could not reset the password.';
    }
    $('rp-submit').disabled = false;
  }

  on($('rp-form'), 'submit', submit);
  preview();
})();
