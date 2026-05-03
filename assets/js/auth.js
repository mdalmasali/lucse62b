/**
 * Shared Authentication State Checker
 * Include this script on EVERY page to keep the header login/profile button in sync.
 * It detects whether the page is in /pages/ or at root to fix relative paths.
 */
(function () {
  // Prevent initializing if hamburger listeners already exist
  if (window.lu62b_auth_initialized) return;
  window.lu62b_auth_initialized = true;

  const userData = localStorage.getItem('lu62b_student') || sessionStorage.getItem('lu62b_student');
  const isInPages = window.location.pathname.includes('/pages/');

  if (userData) {
    const user = JSON.parse(userData);
    const profilePath = isInPages ? 'profile.html' : 'pages/profile.html';

    // Update Desktop Nav
    const navBtn = document.getElementById('navLoginBtn');
    if (navBtn) {
      navBtn.innerHTML = `<i class="fa-solid fa-user"></i> Profile`;
      navBtn.href = profilePath;
      navBtn.style.color = 'var(--green)';
    }

    // Update Mobile Nav
    const mobileBtn = document.getElementById('mobileLoginBtn');
    if (mobileBtn) {
      mobileBtn.innerHTML = `<i class="fa-solid fa-user"></i> Profile`;
      mobileBtn.href = profilePath;
      mobileBtn.style.color = 'var(--green)';
    }
  }

  // Initialize hamburger menu (only once)
  function initHamburger() {
    const ham = document.getElementById('hamburger');
    const mNav = document.getElementById('mobileNav');
    const mClose = document.getElementById('mobileNavClose');

    if (!ham || !mNav || !mClose) return;

    ham.addEventListener('click', (e) => {
      e.stopPropagation();
      ham.classList.toggle('open');
      mNav.classList.toggle('open');
    });

    mClose.addEventListener('click', (e) => {
      e.stopPropagation();
      ham.classList.remove('open');
      mNav.classList.remove('open');
    });

    mNav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        ham.classList.remove('open');
        mNav.classList.remove('open');
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!ham.contains(e.target) && !mNav.contains(e.target) && mNav.classList.contains('open')) {
        ham.classList.remove('open');
        mNav.classList.remove('open');
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHamburger);
  } else {
    initHamburger();
  }
})();
