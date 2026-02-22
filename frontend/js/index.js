/**
 * Proconix Landing Page – Operative login modal (temp password + set new password).
 * Triggered by "I'm Operative" button; step-based flow; AJAX; redirect on success.
 */

(function () {
  'use strict';

  var modal = document.getElementById('operative-login-modal');
  var backdrop = document.getElementById('operative-modal-backdrop');
  var closeBtn = document.getElementById('operative-modal-close');
  var triggerBtn = document.getElementById('btn-operative-login');
  var stepLogin = document.getElementById('operative-step-login');
  var step1 = document.getElementById('operative-step-1');
  var step2 = document.getElementById('operative-step-2');
  var errorEl = document.getElementById('operative-modal-error');
  var formLogin = document.getElementById('operative-form-login');
  var formTemp = document.getElementById('operative-form-temp');
  var formPassword = document.getElementById('operative-form-password');

  var operativeToken = null;

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message || '';
    errorEl.classList.remove('d-none');
  }

  function hideError() {
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('d-none');
    }
  }

  function openModal() {
    operativeToken = null;
    hideError();
    if (stepLogin) stepLogin.classList.remove('d-none');
    if (step1) step1.classList.add('d-none');
    if (step2) step2.classList.add('d-none');
    if (formLogin) formLogin.reset();
    if (formTemp) formTemp.reset();
    if (formPassword) formPassword.reset();
    if (modal) {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'true');
    }
  }

  function showStepLogin() {
    hideError();
    if (stepLogin) stepLogin.classList.remove('d-none');
    if (step1) step1.classList.add('d-none');
    if (step2) step2.classList.add('d-none');
  }

  function showStepTemp() {
    hideError();
    if (stepLogin) stepLogin.classList.add('d-none');
    if (step1) step1.classList.remove('d-none');
    if (step2) step2.classList.add('d-none');
  }

  function closeModal() {
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'false');
    }
    operativeToken = null;
  }

  function goToStep2() {
    hideError();
    if (step1) step1.classList.add('d-none');
    if (step2) step2.classList.remove('d-none');
  }

  function setLoading(button, loading) {
    if (!button) return;
    button.disabled = loading;
    var label = 'Please wait…';
    if (!loading) {
      if (button.id === 'operative-btn-login') label = 'Log in';
      else if (button.id === 'operative-btn-validate') label = 'Validate';
      else if (button.id === 'operative-btn-set-password') label = 'Set Password';
    }
    button.textContent = loading ? 'Please wait…' : label;
  }

  // Open modal on "I'm Operative" click
  if (triggerBtn) {
    triggerBtn.addEventListener('click', function (e) {
      e.preventDefault();
      openModal();
    });
  }

  if (backdrop) backdrop.addEventListener('click', closeModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  document.getElementById('operative-switch-to-temp').addEventListener('click', showStepTemp);
  document.getElementById('operative-switch-to-login').addEventListener('click', showStepLogin);

  // Normal login: email + password
  if (formLogin) {
    formLogin.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('operative-login-email');
      var password = document.getElementById('operative-login-password');
      var btn = document.getElementById('operative-btn-login');
      if (!email || !password) return;
      hideError();
      setLoading(btn, true);
      fetch('/api/operatives/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.value.trim().toLowerCase(),
          password: password.value,
        }),
      })
        .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
        .then(function (result) {
          setLoading(btn, false);
          if (result.status === 200 && result.data.success && result.data.token) {
            var token = result.data.token;
            try {
              localStorage.setItem('proconix_operative_token', token);
              sessionStorage.setItem('proconix_operative_token', token);
              if (result.data.user) {
                localStorage.setItem('proconix_operative_user', JSON.stringify(result.data.user));
              }
            } catch (e) {}
            closeModal();
            window.location.href = '/operative_dashboard.html';
          } else {
            showError(result.data.message || 'Invalid email or password.');
          }
        })
        .catch(function () {
          setLoading(btn, false);
          showError('Request failed. Please try again.');
        });
    });
  }

  // Step 1: Validate temporary password (first time only)
  if (formTemp) {
    formTemp.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('operative-email');
      var tempPassword = document.getElementById('operative-temp-password');
      var btn = document.getElementById('operative-btn-validate');
      if (!email || !tempPassword) return;

      hideError();
      setLoading(btn, true);

      fetch('/api/operatives/login-temp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.value.trim().toLowerCase(),
          temporaryPassword: tempPassword.value.trim(),
        }),
      })
        .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
        .then(function (result) {
          setLoading(btn, false);
          if (result.status === 200 && result.data.success && result.data.token) {
            operativeToken = result.data.token;
            goToStep2();
          } else {
            showError(result.data.message || 'Invalid email or temporary password.');
          }
        })
        .catch(function () {
          setLoading(btn, false);
          showError('Request failed. Please try again.');
        });
    });
  }

  // Step 2: Set new password
  if (formPassword) {
    formPassword.addEventListener('submit', function (e) {
      e.preventDefault();
      var newPassword = document.getElementById('operative-new-password');
      var confirmPassword = document.getElementById('operative-confirm-password');
      var btn = document.getElementById('operative-btn-set-password');
      if (!newPassword || !confirmPassword) return;

      hideError();

      if (newPassword.value.length < 8) {
        showError('New password must be at least 8 characters.');
        return;
      }
      if (newPassword.value !== confirmPassword.value) {
        showError('Passwords do not match.');
        return;
      }
      if (!operativeToken) {
        showError('Session expired. Please start the login again.');
        return;
      }

      setLoading(btn, true);

      fetch('/api/operatives/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: operativeToken,
          newPassword: newPassword.value,
          confirmPassword: confirmPassword.value,
        }),
      })
        .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
        .then(function (result) {
          setLoading(btn, false);
          if (result.status === 200 && result.data.success) {
            var token = result.data.token;
            if (token) {
              try {
                localStorage.setItem('proconix_operative_token', token);
                sessionStorage.setItem('proconix_operative_token', token);
                if (result.data.user) {
                  localStorage.setItem('proconix_operative_user', JSON.stringify(result.data.user));
                }
              } catch (e) {}
            }
            closeModal();
            window.location.href = '/operative_dashboard.html';
          } else {
            showError(result.data.message || 'Failed to set password. Please try again.');
          }
        })
        .catch(function () {
          setLoading(btn, false);
          showError('Request failed. Please try again.');
        });
    });
  }
})();
