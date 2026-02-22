/**
 * See Plans page – interactivity: scroll animations, CTA link handling.
 */

(function () {
  'use strict';

  // Optional: fade-in / slide-in cards when they enter the viewport
  function initScrollAnimation() {
    const cards = document.querySelectorAll('.pricing-card');
    if (!cards.length) return;

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry, i) {
          if (!entry.isIntersecting) return;
          // Stagger delay for multiple cards
          setTimeout(function () {
            entry.target.classList.add('animate-in');
          }, i * 80);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    cards.forEach(function (card) {
      observer.observe(card);
    });
  }

  // Intercept plan links
  function initPlanLinks() {
    document.querySelectorAll('a[href^="/api/subscriptions/"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        // Allow normal GET (backend returns JSON)
      });
    });
  }

  // Request a Callback form: validation + POST /api/contact/request-callback
  function initCallbackForm() {
    var form = document.getElementById('callbackForm');
    var messageEl = document.getElementById('callbackFormMessage');
    var submitBtn = document.getElementById('callbackSubmitBtn');
    if (!form || !messageEl) return;

    function showFormMessage(text, isError) {
      messageEl.textContent = text;
      messageEl.className = 'alert alert-' + (isError ? 'danger' : 'success');
      messageEl.classList.remove('d-none');
    }

    function hideFormMessage() {
      messageEl.classList.add('d-none');
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideFormMessage();
      if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
      }

      submitBtn.disabled = true;
      var payload = {
        fullName: document.getElementById('callbackFullName').value.trim(),
        email: document.getElementById('callbackEmail').value.trim(),
        phone: document.getElementById('callbackPhone').value.trim(),
      };

      try {
        var res = await fetch('/api/contact/request-callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        var text = await res.text();
        var data = {};
        try {
          data = JSON.parse(text);
        } catch (_) {}

        if (res.ok && data.success) {
          showFormMessage(data.message || 'Thank you! We will contact you shortly.', false);
          form.reset();
          form.classList.remove('was-validated');
        } else {
          showFormMessage(data.message || data.error || 'Something went wrong. Please try again.', true);
        }
      } catch (err) {
        showFormMessage('Network error. Please try again.', true);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initScrollAnimation();
      initPlanLinks();
      initCallbackForm();
    });
  } else {
    initScrollAnimation();
    initPlanLinks();
    initCallbackForm();
  }
})();
