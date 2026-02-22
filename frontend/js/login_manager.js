/**
 * Manager login: POST /api/managers/login, store session (localStorage or sessionStorage), redirect to dashboard.
 */

(function () {
  'use strict';

  var SESSION_KEY = 'proconix_manager_session';
  var DASHBOARD_URL = '/dashboard_manager.html';

  var form = document.getElementById('loginManagerForm');
  var messageEl = document.getElementById('loginMessage');
  var submitBtn = document.getElementById('loginSubmitBtn');
  var btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
  var btnLoading = submitBtn ? submitBtn.querySelector('.btn-loading') : null;

  function showMessage(text, isError) {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.className = 'alert alert-' + (isError ? 'danger' : 'success');
    messageEl.classList.remove('d-none');
  }

  function hideMessage() {
    if (messageEl) messageEl.classList.add('d-none');
  }

  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    if (btnText) btnText.classList.toggle('d-none', loading);
    if (btnLoading) btnLoading.classList.toggle('d-none', !loading);
  }

  function storeSession(manager, keepLoggedIn) {
    var session = {
      manager_id: manager.id,
      company_id: manager.company_id,
      name: manager.name,
      surname: manager.surname,
      email: manager.email,
      active: manager.active === true,
    };
    var json = JSON.stringify(session);
    if (keepLoggedIn) {
      localStorage.setItem(SESSION_KEY, json);
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, json);
      localStorage.removeItem(SESSION_KEY);
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    hideMessage();
    setLoading(true);

    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    var keepLoggedIn = document.getElementById('keepLoggedIn').checked;

    fetch('/api/managers/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (res.ok && data.success && data.manager) {
            storeSession(data.manager, keepLoggedIn);
            showMessage('Login successful. Redirecting…', false);
            window.location.href = DASHBOARD_URL;
            return;
          }
          setLoading(false);
          showMessage(data.message || 'Login failed. Please try again.', true);
        }, function () {
          setLoading(false);
          showMessage('Server error. Please try again or contact support.', true);
        });
      })
      .catch(function (err) {
        setLoading(false);
        var msg = 'Network error. ';
        if (err && err.message && err.message.indexOf('fetch') !== -1) {
          msg += 'Make sure the server is running (npm start) and you open this page at http://localhost:3000';
        } else {
          msg += 'Please try again.';
        }
        showMessage(msg, true);
      });
  });
})();
