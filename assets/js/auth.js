/**
 * Shared Authentication State Checker
 * Include this script on EVERY page to keep the header login/profile button in sync.
 * It detects whether the page is in /pages/ or at root to fix relative paths.
 */
(function () {
  const userData = localStorage.getItem('lu62b_student') || sessionStorage.getItem('lu62b_student');
  if (!userData) return;

  const user = JSON.parse(userData);
  const isInPages = window.location.pathname.includes('/pages/');
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

  // Hamburger toggle (shared across all pages)
  const ham = document.getElementById('hamburger');
  const mNav = document.getElementById('mobileNav');
  const mClose = document.getElementById('mobileNavClose');
  if (ham && mNav && mClose) {
    ham.addEventListener('click', () => { ham.classList.toggle('open'); mNav.classList.toggle('open'); });
    mClose.addEventListener('click', () => { ham.classList.remove('open'); mNav.classList.remove('open'); });
    mNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { ham.classList.remove('open'); mNav.classList.remove('open'); }));
  }
})();
