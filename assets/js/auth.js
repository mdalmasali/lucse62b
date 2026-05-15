/**
 * Shared Authentication State Checker
 * - Keeps header login/profile button in sync
 * - Option A: Force re-login after 7 days
 * - Option B: Background sheet re-validation every 1 hour
 */
(function () {
  if (window.lu62b_auth_initialized) return;
  window.lu62b_auth_initialized = true;

  const WORKER_URL = 'https://lucse62b-api.sy164425.workers.dev';
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
      setTimeout(function () { resolve(false); }, 5000); // network timeout → fail closed
    });
    var check = fetch(WORKER_URL + '/lookup?id=' + encodeURIComponent(studentId))
      .then(function (r) { return r.json(); })
      .then(function (data) { return data.found === true; })
      .catch(function () { return false; }); // network error → fail closed
    return Promise.race([timeout, check]);
  }

  function runBackgroundValidation(session) {
    if (!session || !session.id) return;
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

      // B — background sheet re-validation (once per hour, applies to all sessions)
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

  // ── DOB Gate ─────────────────────────────────────────────────────────
  const SUPA_URL  = 'https://ftvtlqxpalwvyserujuh.supabase.co';
  const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';
  const SKIP_DOB  = ['login.html', 'password-setup.html'];
  const _curPage  = window.location.pathname.split('/').pop();

  function _supaRpc(fn, params) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }).then(function (r) { if (!r.ok) throw new Error('rpc'); return r.json(); });
  }

  function _showDobGate(sid) {
    var style = document.createElement('style');
    style.textContent = [
      '#lu62b-dob-gate{position:fixed;inset:0;z-index:99999;background:rgba(10,10,20,.92);',
      'backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px;}',
      '.lu62b-dob-box{background:#1a1a2e;border:1px solid rgba(99,102,241,.35);border-radius:20px;',
      'padding:36px 32px;max-width:420px;width:100%;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.6);}',
      '.lu62b-dob-box .dob-icon{font-size:2.4rem;margin-bottom:16px;}',
      '.lu62b-dob-box h2{font-size:1.25rem;font-weight:700;color:#e2e8f0;margin:0 0 8px;}',
      '.lu62b-dob-box p{font-size:0.82rem;color:#94a3b8;margin:0 0 24px;line-height:1.55;}',
      '.lu62b-dob-box input[type=date]{width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);',
      'color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:0.88rem;outline:none;',
      'box-sizing:border-box;margin-bottom:12px;}',
      '.lu62b-dob-box input[type=date]:focus{border-color:#6366f1;}',
      '.lu62b-dob-box button{width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);',
      'color:#fff;border:none;border-radius:10px;padding:11px;font-size:0.9rem;font-weight:600;',
      'cursor:pointer;transition:opacity .2s;}',
      '.lu62b-dob-box button:disabled{opacity:.6;cursor:not-allowed;}',
      '.lu62b-dob-err{font-size:0.78rem;color:#f87171;margin-top:8px;min-height:18px;}',
    ].join('');
    document.head.appendChild(style);

    var gate = document.createElement('div');
    gate.id = 'lu62b-dob-gate';
    gate.innerHTML = [
      '<div class="lu62b-dob-box">',
      '<div class="dob-icon">🎂</div>',
      '<h2>One quick step</h2>',
      '<p>Enter your date of birth to continue.<br>This is used to verify your identity and personalise your experience.</p>',
      '<input type="date" id="lu62b-dob-input" max="' + new Date().toISOString().split('T')[0] + '">',
      '<button id="lu62b-dob-btn">Save &amp; Continue</button>',
      '<div class="lu62b-dob-err" id="lu62b-dob-err"></div>',
      '</div>',
    ].join('');

    var inject = function () {
      document.body.appendChild(gate);
      document.getElementById('lu62b-dob-btn').addEventListener('click', function () {
        var input  = document.getElementById('lu62b-dob-input');
        var btn    = document.getElementById('lu62b-dob-btn');
        var errEl  = document.getElementById('lu62b-dob-err');
        var dob    = input ? input.value : '';
        errEl.textContent = '';
        if (!dob) { errEl.textContent = 'Please enter your date of birth.'; return; }
        btn.disabled = true; btn.textContent = 'Saving…';
        _supaRpc('set_student_dob', { p_student_id: sid, p_dob: dob })
          .then(function () {
            localStorage.setItem('lu62b_dob_' + sid, dob);
            document.getElementById('lu62b-dob-gate').remove();
          })
          .catch(function () {
            errEl.textContent = 'Connection error. Please try again.';
            btn.disabled = false; btn.textContent = 'Save & Continue';
          });
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject);
    } else {
      inject();
    }
  }

  if (isLoggedIn && session && session.id && !isDemoSession && !SKIP_DOB.includes(_curPage)) {
    var _dobKey     = 'lu62b_dob_' + session.id;
    var _syncedKey  = 'lu62b_dob_synced_' + session.id;
    var _localDob   = localStorage.getItem(_dobKey);
    var _synced     = sessionStorage.getItem(_syncedKey);

    if (!_synced) {
      // First page of this browser session — always verify against Supabase
      _supaRpc('student_has_dob', { p_student_id: session.id })
        .then(function (hasDob) {
          if (hasDob) {
            sessionStorage.setItem(_syncedKey, '1');
            if (!_localDob) {
              // Supabase has it but local doesn't — cache it
              return _supaRpc('get_student_dob', { p_student_id: session.id })
                .then(function (dob) { if (dob) localStorage.setItem(_dobKey, dob); });
            }
          } else if (_localDob) {
            // Local has DOB but Supabase doesn't — sync up silently
            return _supaRpc('set_student_dob', { p_student_id: session.id, p_dob: _localDob })
              .then(function () { sessionStorage.setItem(_syncedKey, '1'); });
          } else {
            // Neither has DOB — show gate
            _showDobGate(session.id);
          }
        })
        .catch(function () { /* Supabase unreachable — don't block */ });
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
