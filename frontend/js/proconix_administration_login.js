/**
 * Proconix platform administration – sign-in (POST /api/platform-admin/login).
 */
(function () {
  'use strict';

  var SESSION_KEY = 'proconix_platform_admin_session';

  var form = document.getElementById('pxAdminLoginForm');
  var msgEl = document.getElementById('pxAdminMessage');
  var submitBtn = document.getElementById('pxAdminSubmitBtn');
  var btnText = submitBtn && submitBtn.querySelector('.btn-text');
  var btnLoading = submitBtn && submitBtn.querySelector('.btn-loading');
  var modeSignInBtn = document.getElementById('pxModeSignIn');
  var modeRegisterBtn = document.getElementById('pxModeRegister');
  var submitText = document.getElementById('pxAdminSubmitText');
  var isRegisterMode = false;

  function showMessage(text, type) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = 'alert';
    msgEl.classList.add(type === 'error' ? 'alert-danger' : type === 'success' ? 'alert-success' : 'alert-info');
    msgEl.classList.remove('d-none');
  }

  function hideMessage() {
    if (!msgEl) return;
    msgEl.classList.add('d-none');
  }

  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    if (btnText) btnText.classList.toggle('d-none', loading);
    if (btnLoading) btnLoading.classList.toggle('d-none', !loading);
  }

  function persistSession(payload, remember) {
    var json = JSON.stringify(payload);
    try {
      if (remember) {
        localStorage.setItem(SESSION_KEY, json);
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        sessionStorage.setItem(SESSION_KEY, json);
        localStorage.removeItem(SESSION_KEY);
      }
    } catch (e) {
      showMessage('Could not save session in this browser.', 'error');
      return false;
    }
    return true;
  }

  function setMode(registerMode) {
    isRegisterMode = !!registerMode;
    if (modeSignInBtn) modeSignInBtn.classList.toggle('active', !isRegisterMode);
    if (modeRegisterBtn) modeRegisterBtn.classList.toggle('active', isRegisterMode);
    if (submitText) submitText.textContent = isRegisterMode ? 'Register' : 'Sign in';
  }

  if (!form) return;

  if (modeSignInBtn) {
    modeSignInBtn.addEventListener('click', function () { setMode(false); hideMessage(); });
  }
  if (modeRegisterBtn) {
    modeRegisterBtn.addEventListener('click', function () { setMode(true); hideMessage(); });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    e.stopPropagation();
    hideMessage();

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    form.classList.add('was-validated');
    var emailEl = document.getElementById('pxAdminEmail');
    var passEl = document.getElementById('pxAdminPassword');
    var rememberEl = document.getElementById('pxAdminRemember');
    var email = emailEl && emailEl.value ? emailEl.value.trim() : '';
    var password = passEl && passEl.value ? passEl.value : '';
    var remember = rememberEl && rememberEl.checked;

    setLoading(true);

    fetch(isRegisterMode ? '/api/platform-admin/register' : '/api/platform-admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }),
      credentials: 'same-origin',
    })
      .then(function (res) {
        var ct = res.headers.get('Content-Type') || '';
        if (ct.indexOf('application/json') === -1) {
          return res.text().then(function (t) {
            throw new Error(t || 'Server error');
          });
        }
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (out) {
        if ((out.status === 200 || out.status === 201) && out.data && out.data.success && out.data.platform_admin) {
          var pa = out.data.platform_admin;
          var payload = {
            id: pa.id,
            email: pa.email,
            full_name: pa.full_name,
            admin_rank: pa.admin_rank,
            access_level: pa.access_level,
            signedInAt: Date.now(),
            source: 'server',
          };
          if (!persistSession(payload, remember)) {
            setLoading(false);
            return;
          }
          window.location.href = 'proconix_administration.html';
          return;
        }
        var msg =
          (out.data && out.data.message) ||
          (out.status === 503 ? 'Platform admin is not configured on the server.' : (isRegisterMode ? 'Registration failed.' : 'Sign in failed.'));
        showMessage(msg, 'error');
        setLoading(false);
      })
      .catch(function (err) {
        showMessage(err.message || 'Network error. Is the server running?', 'error');
        setLoading(false);
      });
  });
})();
