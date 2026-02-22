/**
 * Register Manager: read onboarding token, resolve company_id, submit form to POST /api/managers/create.
 */

(function () {
  'use strict';

  var TOKEN_KEY = 'proconix_onboarding_token';
  var SESSION_KEY = 'proconix_manager_session';

  var form = document.getElementById('registerManagerForm');
  var companyIdInput = document.getElementById('company_id');
  var formMessage = document.getElementById('formMessage');
  var noTokenMessage = document.getElementById('noTokenMessage');
  var formCard = document.getElementById('managerFormCard');
  var submitBtn = document.getElementById('submitBtn');

  function showMessage(text, isError) {
    formMessage.textContent = text;
    formMessage.className = 'alert alert-' + (isError ? 'danger' : 'success');
    formMessage.classList.remove('d-none');
  }

  function hideMessage() {
    formMessage.classList.add('d-none');
  }

  /**
   * Load company_id from token (GET /api/onboarding/company?token=xxx).
   * If no token or invalid, show message and optionally redirect.
   */
  function loadCompanyFromToken() {
    var token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      noTokenMessage.classList.remove('d-none');
      if (formCard) formCard.classList.add('d-none');
      return;
    }

    return fetch('/api/onboarding/company?token=' + encodeURIComponent(token))
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.message || 'Invalid token');
          return data;
        });
      })
      .then(function (data) {
        if (data.company_id != null) {
          companyIdInput.value = String(data.company_id);
          noTokenMessage.classList.add('d-none');
          if (formCard) formCard.classList.remove('d-none');
        } else {
          throw new Error('Company not found');
        }
      })
      .catch(function (err) {
        localStorage.removeItem(TOKEN_KEY);
        noTokenMessage.classList.remove('d-none');
        if (formCard) formCard.classList.add('d-none');
      });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }
    if (!companyIdInput.value) {
      showMessage('Session expired. Please register your company again.', true);
      return;
    }

    submitBtn.disabled = true;
    hideMessage();

    var payload = {
      company_id: parseInt(companyIdInput.value, 10),
      name: document.getElementById('name').value.trim(),
      surname: document.getElementById('surname').value.trim(),
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    };

    fetch('/api/managers/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (res.ok && data.success) {
            if (data.manager) {
              var session = {
                manager_id: data.manager.id,
                company_id: data.manager.company_id,
                name: data.manager.name,
                surname: data.manager.surname,
                email: data.manager.email,
                active: data.manager.active === true,
              };
              localStorage.setItem(SESSION_KEY, JSON.stringify(session));
              localStorage.removeItem(TOKEN_KEY);
            }
            showMessage(data.message || 'Manager registered successfully.', false);
            form.reset();
            form.classList.remove('was-validated');
            companyIdInput.value = '';
          } else {
            var msg = (data.errors && data.errors.length) ? data.errors.join(' ') : (data.message || data.error || 'Registration failed.');
            showMessage(msg, true);
          }
        });
      })
      .catch(function () {
        showMessage('Network error. Please try again.', true);
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  }

  if (form) {
    form.addEventListener('submit', handleSubmit);
  }

  loadCompanyFromToken();
})();
