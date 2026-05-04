/**
 * Shared Authentication State Checker
 * Include this script on EVERY page to keep the header login/profile button in sync.
 * It detects whether the page is in /pages/ or at root to fix relative paths.
 */
(function () {
  if (window.lu62b_auth_initialized) return;
  window.lu62b_auth_initialized = true;

  const userData  = localStorage.getItem('lu62b_student') || sessionStorage.getItem('lu62b_student');
  const isInPages = window.location.pathname.includes('/pages/');
  const isLoggedIn = !!userData;

  if (isLoggedIn) {
    document.documentElement.classList.add('lu62b-logged-in');

    const profilePath = isInPages ? 'profile.html' : 'pages/profile.html';

    function updateNavButtons() {
      const navBtn = document.getElementById('navLoginBtn');
      if (navBtn) {
        navBtn.innerHTML = `<i class="fa-solid fa-user"></i> Profile`;
        navBtn.href = profilePath;
        navBtn.style.color = 'var(--green)';
      }
      const mobileBtn = document.getElementById('mobileLoginBtn');
      if (mobileBtn) {
        mobileBtn.innerHTML = `<i class="fa-solid fa-user"></i> Profile`;
        mobileBtn.href = profilePath;
        mobileBtn.style.color = 'var(--green)';
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', updateNavButtons);
    } else {
      updateNavButtons();
    }
  }

  // ── Hamburger menu ──────────────────────────────────────────────────
  function initHamburger() {
    const ham   = document.getElementById('hamburger');
    const mNav  = document.getElementById('mobileNav');
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
    mNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      ham.classList.remove('open');
      mNav.classList.remove('open');
    }));
    document.addEventListener('click', (e) => {
      if (!ham.contains(e.target) && !mNav.contains(e.target) && mNav.classList.contains('open')) {
        ham.classList.remove('open');
        mNav.classList.remove('open');
      }
    });
  }

  // ── Mobile Bottom Navigation Bar ────────────────────────────────────
  function injectBottomNav() {
    if (document.getElementById('mobileBottomNav')) return;

    const path  = window.location.pathname;
    const page  = path.split('/').pop().replace('.html', '') || 'index';
    const root  = isInPages ? '../' : '';
    const sub   = isInPages ? '' : 'pages/';

    const items = [
      { href: root + 'index.html',             icon: 'fa-house',              label: 'Home',      id: 'index',    show: true },
      { href: sub + 'resources.html',           icon: 'fa-book-open',          label: 'Materials', id: 'resources', show: isLoggedIn },
      { href: sub + 'notices.html',             icon: 'fa-bell',               label: 'Notices',   id: 'notices',  show: isLoggedIn },
      { href: sub + 'gallery.html',             icon: 'fa-images',             label: 'Gallery',   id: 'gallery',  show: true },
      isLoggedIn
        ? { href: sub + 'profile.html',         icon: 'fa-user',               label: 'Profile',   id: 'profile',  show: true }
        : { href: sub + 'login.html',           icon: 'fa-right-to-bracket',   label: 'Login',     id: 'login',    show: true },
    ];

    const nav = document.createElement('nav');
    nav.id        = 'mobileBottomNav';
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Mobile navigation');

    items.filter(i => i.show).forEach(item => {
      const isActive = page === item.id || (page === '' && item.id === 'index');
      const a = document.createElement('a');
      a.href      = item.href;
      a.className = 'mbn-item' + (isActive ? ' active' : '');
      a.setAttribute('aria-label', item.label);
      a.innerHTML = `<i class="fa-solid ${item.icon}"></i><span>${item.label}</span>`;
      nav.appendChild(a);
    });

    document.body.appendChild(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initHamburger(); injectBottomNav(); });
  } else {
    initHamburger();
    injectBottomNav();
  }
})();
