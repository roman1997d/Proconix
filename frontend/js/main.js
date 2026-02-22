/**
 * Proconix Landing Page – main script
 * Optional: smooth scroll, nav highlight, or other small interactions
 */

document.addEventListener('DOMContentLoaded', function () {
  // Smooth scroll for anchor links (if you add #section links later)
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Optional: add subtle class to body after load for any entrance effects
  document.body.classList.add('loaded');
});
