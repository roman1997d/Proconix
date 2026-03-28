/**
 * Proconix Landing Page – index.js
 * Operative login modal, scroll reveal, smooth scroll.
 */

(function () {
  'use strict';
  var MANAGER_SESSION_KEY = 'proconix_manager_session';
  var OP_TOKEN_KEY = 'proconix_operative_token';
  var OP_USER_KEY = 'proconix_operative_user';
  var DASH_MANAGER = '/dashboard_manager.html';
  var DASH_OPERATIVE = '/operative_dashboard.html';

  function clearOperativeSession() {
    try {
      localStorage.removeItem(OP_TOKEN_KEY);
      localStorage.removeItem(OP_USER_KEY);
      sessionStorage.removeItem(OP_TOKEN_KEY);
    } catch (_) {}
  }

  /**
   * Try manager first (Keep me logged in → localStorage only), then operative token.
   * Operative token is stored in localStorage + sessionStorage on login (same as operative_dashboard.js).
   */
  function redirectIfKnownSessionValid() {
    try {
      var raw = localStorage.getItem(MANAGER_SESSION_KEY);
      if (raw) {
        var session = JSON.parse(raw);
        if (session && session.manager_id != null && session.email) {
          fetch('/api/auth/validate', {
            headers: {
              'X-Manager-Id': String(session.manager_id),
              'X-Manager-Email': String(session.email).trim(),
            },
          })
            .then(function (res) {
              if (res.ok) {
                window.location.replace(DASH_MANAGER);
                return;
              }
              if (res.status === 401) {
                try {
                  localStorage.removeItem(MANAGER_SESSION_KEY);
                } catch (_) {}
              }
              tryOperativeRedirect();
            })
            .catch(function () {
              tryOperativeRedirect();
            });
          return;
        }
      }
    } catch (_) {}
    tryOperativeRedirect();
  }

  function tryOperativeRedirect() {
    try {
      var token = localStorage.getItem(OP_TOKEN_KEY) || sessionStorage.getItem(OP_TOKEN_KEY);
      if (!token) return;
      fetch('/api/operatives/me', {
        headers: { 'X-Operative-Token': token },
      })
        .then(function (res) {
          if (res.ok) {
            window.location.replace(DASH_OPERATIVE);
            return;
          }
          if (res.status === 401) {
            clearOperativeSession();
          }
        })
        .catch(function () {});
    } catch (_) {}
  }

  redirectIfKnownSessionValid();
})();

(function () {
  'use strict';
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMain);
  } else {
    initMain();
  }
  function initMain() {
    document.body.classList.add('loaded');
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var target = document.querySelector(this.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }
})();

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

  var switchToTempBtn = document.getElementById('operative-switch-to-temp');
  var switchToLoginBtn = document.getElementById('operative-switch-to-login');
  if (switchToTempBtn) {
    switchToTempBtn.addEventListener('click', showStepTemp);
  }
  if (switchToLoginBtn) {
    switchToLoginBtn.addEventListener('click', showStepLogin);
  }

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

/** Book a demo modal (navbar) → POST /api/contact/book-demo */
(function () {
  'use strict';

  var modal = document.getElementById('book-demo-modal');
  var backdrop = document.getElementById('book-demo-modal-backdrop');
  var closeBtn = document.getElementById('book-demo-modal-close');
  var triggerBtn = document.getElementById('btn-book-demo');
  var form = document.getElementById('book-demo-form');
  var errorEl = document.getElementById('book-demo-modal-error');
  var successEl = document.getElementById('book-demo-success');
  var submitBtn = document.getElementById('book-demo-submit');

  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg || '';
    errorEl.classList.remove('d-none');
  }

  function hideError() {
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('d-none');
    }
  }

  function hideSuccess() {
    if (successEl) {
      successEl.textContent = '';
      successEl.classList.add('d-none');
    }
  }

  function openModal() {
    hideError();
    hideSuccess();
    if (form) form.classList.remove('d-none');
    if (form) form.reset();
    if (modal) {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'true');
    }
  }

  function closeModal() {
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'false');
    }
    hideError();
    hideSuccess();
    if (form) {
      form.classList.remove('d-none');
      form.reset();
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request demo';
    }
  }

  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? 'Sending…' : 'Request demo';
  }

  if (triggerBtn) {
    triggerBtn.addEventListener('click', function () {
      openModal();
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (backdrop) backdrop.addEventListener('click', closeModal);

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideError();
      hideSuccess();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      var firstName = (document.getElementById('book-demo-first-name') || {}).value;
      var lastName = (document.getElementById('book-demo-last-name') || {}).value;
      var email = (document.getElementById('book-demo-email') || {}).value;
      var roleEl = document.getElementById('book-demo-role');
      var role = roleEl && roleEl.value ? roleEl.value : '';

      setLoading(true);
      fetch('/api/contact/book-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          firstName: (firstName || '').trim(),
          lastName: (lastName || '').trim(),
          email: (email || '').trim(),
          role: (role || '').trim(),
        }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function (result) {
          setLoading(false);
          if (result.ok && result.data && result.data.success) {
            form.classList.add('d-none');
            if (successEl) {
              successEl.textContent =
                result.data.message ||
                'Thank you! We will be in touch to schedule your demo.';
              successEl.classList.remove('d-none');
            }
            window.setTimeout(closeModal, 3200);
          } else {
            showError(
              (result.data && result.data.message) || 'Something went wrong. Please try again.'
            );
          }
        })
        .catch(function () {
          setLoading(false);
          showError('Request failed. Please try again or email info@proconix.uk.');
        });
    });
  }
})();

// Scroll animations for landing page (cursor effects removed)
(function () {
  'use strict';

  var revealEls = document.querySelectorAll('.reveal-on-scroll');
  if (revealEls.length && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    revealEls.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add('reveal-visible');
    });
  }
})();
