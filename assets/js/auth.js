/**
 * Shared Authentication State Checker
 * - Keeps header login/profile button in sync
 * - Option A: Force re-login after 7 days
 * - Option B: Background sheet re-validation every 1 hour
 */
(function () {
  if (window.lu62b_auth_initialized) return;
  window.lu62b_auth_initialized = true;

  const WORKER_URL = 'https://api.lucse62.xyz';
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const ONE_HOUR   = 60 * 60 * 1000;

  const rawData    = localStorage.getItem('lu62b_student') || sessionStorage.getItem('lu62b_student');
  const isInPages  = window.location.pathname.includes('/pages/');
  const isLoggedIn = !!rawData;
  var session      = null;

  try { session = rawData ? JSON.parse(rawData) : null; } catch (e) {}

  const isDemoSession = !!(
    session &&
    (session.isDemo || String(session.id || '').toUpperCase() === 'DEMO')
  );

  // ── Force logout helper ──────────────────────────────────────────────
  function forceLogout(reason) {
    localStorage.removeItem('lu62b_student');
    sessionStorage.removeItem('lu62b_student');
    localStorage.removeItem('lu62b_last_validation');
    const loginPath = isInPages ? 'login.html' : 'pages/login.html';
    window.location.replace(loginPath + '?lo=' + reason);
  }

  // ── Sheet validation (proxied via Worker) ────────────────────────────
  function checkStudentInSheet(studentId) {
    var timeout = new Promise(function (resolve) {
      setTimeout(function () { resolve(true); }, 8000); // network timeout → assume valid
    });
    var check = fetch(WORKER_URL + '/sheet?name=Student%20Info')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var rows = (data.table && data.table.rows) || [];
        return rows.some(function (row) {
          return (row.c || []).some(function (cell) {
            return cell && cell.v != null && String(cell.v).trim() === studentId;
          });
        });
      })
      .catch(function () { return true; }); // network error → assume valid
    return Promise.race([timeout, check]);
  }

  function runBackgroundValidation(session) {
    if (!session || !session.id || isDemoSession) return;
    // Skip on login/password-setup pages — no point checking there
    const page = window.location.pathname.split('/').pop();
    if (page === 'login.html' || page === 'password-setup.html') return;

    checkStudentInSheet(session.id).then(function (found) {
      if (found) {
        localStorage.setItem('lu62b_last_validation', JSON.stringify({ t: Date.now() }));
      } else {
        forceLogout('removed');
      }
    });
  }

  // ── Session checks (A + B) ───────────────────────────────────────────
  if (isLoggedIn) {
    if (session && session.id) {
      // A — 7-day expiry
      if (session.loginTime && Date.now() - session.loginTime > SEVEN_DAYS) {
        forceLogout('expired');
        return;
      }

      // B — background sheet re-validation (once per hour)
      if (!isDemoSession) {
        var lastVal = null;
        try { lastVal = JSON.parse(localStorage.getItem('lu62b_last_validation')); } catch (e) {}
        var shouldValidate = !lastVal || !lastVal.t || (Date.now() - lastVal.t > ONE_HOUR);

        if (shouldValidate) {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { runBackgroundValidation(session); });
          } else {
            runBackgroundValidation(session);
          }
        }
      }
    }

    document.documentElement.classList.add('lu62b-logged-in');
    if (isDemoSession) document.documentElement.classList.add('lu62b-demo-session');

    var profilePath = isInPages ? 'profile.html' : 'pages/profile.html';

    function updateNavButtons() {
      var profileLabel = '<i class="fa-solid fa-user"></i> Profile';
      if (isDemoSession) {
        profileLabel += ' <span class="lu62b-demo-badge">Demo</span>';
      }

      var navBtn = document.getElementById('navLoginBtn');
      if (navBtn) {
        navBtn.innerHTML = profileLabel;
        navBtn.href      = profilePath;
        navBtn.style.color = 'var(--green)';
      }
      var mobileBtn = document.getElementById('mobileLoginBtn');
      if (mobileBtn) {
        mobileBtn.innerHTML = profileLabel;
        mobileBtn.href      = profilePath;
        mobileBtn.style.color = 'var(--green)';
      }
      var statusPill = document.querySelector('.topbar-status');
      if (statusPill && isDemoSession) {
        statusPill.innerHTML = '<div class="status-dot"></div>Portal Active <span class="lu62b-demo-badge">Demo</span>';
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', updateNavButtons);
    } else {
      updateNavButtons();
    }
  }

  // ── Hamburger menu ───────────────────────────────────────────────────
  function initHamburger() {
    var ham   = document.getElementById('hamburger');
    var mNav  = document.getElementById('mobileNav');
    var mClose = document.getElementById('mobileNavClose');
    if (!ham || !mNav || !mClose) return;

    ham.addEventListener('click', function (e) {
      e.stopPropagation();
      ham.classList.toggle('open');
      mNav.classList.toggle('open');
    });
    mClose.addEventListener('click', function (e) {
      e.stopPropagation();
      ham.classList.remove('open');
      mNav.classList.remove('open');
    });
    mNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        ham.classList.remove('open');
        mNav.classList.remove('open');
      });
    });
    document.addEventListener('click', function (e) {
      if (!ham.contains(e.target) && !mNav.contains(e.target) && mNav.classList.contains('open')) {
        ham.classList.remove('open');
        mNav.classList.remove('open');
      }
    });
  }

  // ── Mobile Bottom Navigation Bar ─────────────────────────────────────
  function injectBottomNav() {
    if (document.getElementById('mobileBottomNav')) return;

    var path = window.location.pathname;
    var page = path.split('/').pop().replace('.html', '') || 'index';
    var root = isInPages ? '../' : '';
    var sub  = isInPages ? '' : 'pages/';

    var items = [
      { href: root + 'index.html',    icon: 'fa-house',            label: 'Home',      id: 'index',     show: true },
      { href: sub + 'resources.html', icon: 'fa-book-open',        label: 'Materials', id: 'resources', show: isLoggedIn },
      { href: sub + 'cover-page.html', icon: 'fa-file-pdf',        label: 'Cover Page', id: 'cover-page', show: true },
      { href: sub + 'result-dashboard.html', icon: 'fa-chart-line', label: 'Results', id: 'result-dashboard', show: isLoggedIn },
      isLoggedIn
        ? { href: sub + 'profile.html', icon: 'fa-user',               label: 'Profile', id: 'profile', show: true }
        : { href: sub + 'login.html',   icon: 'fa-right-to-bracket',   label: 'Login',   id: 'login',   show: true },
    ];

    var nav = document.createElement('nav');
    nav.id        = 'mobileBottomNav';
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Mobile navigation');

    items.filter(function (i) { return i.show; }).forEach(function (item) {
      var isActive = page === item.id || (page === '' && item.id === 'index');
      var a = document.createElement('a');
      a.href      = item.href;
      a.className = 'mbn-item' + (isActive ? ' active' : '');
      a.setAttribute('aria-label', item.label);
      a.innerHTML = '<i class="fa-solid ' + item.icon + '"></i><span>' + item.label + '</span>';
      nav.appendChild(a);
    });

    document.body.appendChild(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initHamburger(); injectBottomNav(); });
  } else {
    initHamburger();
    injectBottomNav();
  }
})();
